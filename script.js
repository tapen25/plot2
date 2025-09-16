// --- DOM要素の取得 ---
const permissionButton = document.getElementById('permission-button');
const statusElem = document.getElementById('status');
const bpmDisplay = document.getElementById('bpm-display');
const bpmContainer = document.getElementById('bpm-container');

// --- Web Audio APIの初期設定 ---
let audioContext;
let scheduler;
let currentBpm = 130.0;

// --- 歩行検出のためのパラメータ ---
let lastStepTimestamp = 0;
const stepTimestamps = [];
const PEAK_THRESHOLD = 11.5;
const MIN_STEP_INTERVAL = 0.25;

// ▼▼▼ 追加 ▼▼▼
// --- 歩行停止検出タイマー ---
let stopDetectionTimer = null; // タイマーのIDを保持する変数
const STOP_THRESHOLD_MS = 2000; // 2000ミリ秒 = 2秒間ステップがなければ停止と判断
let isPlaying = false; // 現在、音楽が再生中かどうかを管理

// --- メインの処理 ---

function init() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    requestSensorPermission();

    permissionButton.style.display = 'none';
    statusElem.textContent = '歩行を開始してください...';
    bpmContainer.style.display = 'block';
    bpmDisplay.textContent = "--"; // 初期表示を"--"に
}
permissionButton.addEventListener('click', init);

function requestSensorPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(state => {
                if (state === 'granted') {
                    window.addEventListener('devicemotion', handleMotionEvent);
                } else {
                    statusElem.textContent = 'センサーへのアクセスが拒否されました。';
                }
            }).catch(console.error);
    } else {
        window.addEventListener('devicemotion', handleMotionEvent);
    }
}

// 3. センサーデータを受け取るたびに実行される関数
function handleMotionEvent(event) {
    if (!event.accelerationIncludingGravity) return;

    const acc = event.accelerationIncludingGravity;
    const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
    
    const currentTime = event.timeStamp / 1000;
    
    if (magnitude > PEAK_THRESHOLD && (currentTime - lastStepTimestamp) > MIN_STEP_INTERVAL) {
        // --- ▼▼▼ ここからが重要な変更 ▼▼▼ ---

        // 1. 既存の停止タイマーをリセット
        //    (歩いている間は、停止タイマーが発動しないようにする)
        clearTimeout(stopDetectionTimer);

        // 2. 新しい停止タイマーをセット
        //    (このステップから2秒後に、停止処理が予約される)
        stopDetectionTimer = setTimeout(stopMusicAndReset, STOP_THRESHOLD_MS);

        // 3. もし音楽が止まっていたら、即座に再生を開始する
        if (!isPlaying) {
            isPlaying = true;
            statusElem.textContent = '歩行を検出中...';
            // 最初の1音を鳴らすことで、即時性を感じさせる
            calculateBpm(true); // trueフラグで初回再生を指示
        }
        
        // --- ▲▲▲ 変更ここまで ▲▲▲ ---

        lastStepTimestamp = currentTime;
        stepTimestamps.push(currentTime);
        if (stepTimestamps.length > 5) {
            stepTimestamps.shift();
        }
        
        // 通常のBPM計算を実行
        calculateBpm(false);
    }
}

// ▼▼▼ 追加 ▼▼▼
// 音楽を停止し、表示をリセットする専門の関数
function stopMusicAndReset() {
    clearTimeout(scheduler); // 音楽スケジューラーを停止
    isPlaying = false;
    stepTimestamps.length = 0; // BPM計算用の履歴をリセット
    bpmDisplay.textContent = '--';
    statusElem.textContent = '停止しました。歩行を再開してください。';
    console.log("--- Music Stopped ---");
}

// BPMを丸める関数 (変更なし)
function quantizeBpm(rawBpm) {
    if (rawBpm >= 80 && rawBpm < 100) return 90;
    if (rawBpm >= 100 && rawBpm < 120) return 110;
    if (rawBpm >= 120 && rawBpm < 140) return 130;
    if (rawBpm >= 140 && rawBpm < 160) return 150;
    if (rawBpm >= 160 && rawBpm < 180) return 170;
    return null;
}

// BPM計算と反映のロジックを更新
function calculateBpm(isFirstBeat = false) {
    if (stepTimestamps.length < 2 && !isFirstBeat) {
        return;
    }

    // 最初の1音だけは、BPM計算を待たずにデフォルト値で鳴らす
    if (isFirstBeat && stepTimestamps.length <= 1) {
        resetScheduler(currentBpm); // デフォルトBPMで開始
        bpmDisplay.textContent = Math.round(currentBpm);
        return;
    }

    const intervals = [];
    for (let i = 1; i < stepTimestamps.length; i++) {
        intervals.push(stepTimestamps[i] - stepTimestamps[i - 1]);
    }
    const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    if (averageInterval > 0) {
        const rawBpm = 60.0 / averageInterval;
        const quantizedBpm = quantizeBpm(rawBpm);

        if (quantizedBpm !== null && quantizedBpm !== currentBpm) {
            currentBpm = quantizedBpm;
            bpmDisplay.textContent = Math.round(currentBpm);
            resetScheduler(currentBpm); // テンポが変わったのでスケジューラーをリセット
        }
    }
}

// スケジューラーと音再生関数 (引数を取るように変更)
function resetScheduler(bpm) {
    if (scheduler) {
        clearTimeout(scheduler);
    }
    
    const beatInterval = 60.0 / bpm;
    
    function schedule() {
        playBeep();
        scheduler = setTimeout(schedule, beatInterval * 1000);
    }
    schedule();
}

function playBeep() {
    if (!audioContext || audioContext.state !== 'running') return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode).connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);

    oscillator.start(audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.05);
    oscillator.stop(audioContext.currentTime + 0.05);
}
