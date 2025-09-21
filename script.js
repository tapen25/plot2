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
const PEAK_THRESHOLD = 10.5; // 少し閾値を下げる→安定
const MIN_STEP_INTERVAL = 0.25;

// --- 歩行停止検出タイマー ---
let stopDetectionTimer = null;
const STOP_THRESHOLD_MS = 2000;
let isPlaying = false;

// --- 移動平均と閾値判定のためのパラメータ ---
const magnitudeHistory = [];      // 加速度の直近の履歴を保持する配列
const MOVING_AVERAGE_WINDOW = 20; // 移動平均に使うデータ数（約0.3秒分 @ 60Hz）
let isAboveThreshold = false;     // 現在、閾値を超えているかの状態を管理するフラグ

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
    bpmDisplay.textContent = "--";
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

// 歩行検出ロジックを刷新
function handleMotionEvent(event) {
    if (!event.accelerationIncludingGravity) return;

    const acc = event.accelerationIncludingGravity;
    const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
    
    // --- 1. 移動平均の計算 ---
    // 履歴に現在の加速度を追加
    magnitudeHistory.push(magnitude);
    // ウィンドウサイズを超えたら古いデータから削除
    if (magnitudeHistory.length > MOVING_AVERAGE_WINDOW) {
        magnitudeHistory.shift();
    }
    // 履歴データの平均値を計算
    const sum = magnitudeHistory.reduce((a, b) => a + b, 0);
    const avgMagnitude = sum / magnitudeHistory.length;

    const currentTime = event.timeStamp / 1000;

    // --- 2. 閾値を超えた「瞬間」を検出 ---
    //    (移動平均が閾値を下から上に超え、かつ前回のステップから一定時間が経過している場合)
    if (avgMagnitude > PEAK_THRESHOLD && !isAboveThreshold && (currentTime - lastStepTimestamp) > MIN_STEP_INTERVAL) {
        
        // 既存の停止タイマーをリセット
        clearTimeout(stopDetectionTimer);

        // 新しい停止タイマーをセット
        stopDetectionTimer = setTimeout(stopMusicAndReset, STOP_THRESHOLD_MS);

        // もし音楽が止まっていたら、即座に再生を開始する
        if (!isPlaying) {
            isPlaying = true;
            statusElem.textContent = '歩行を検出中...';
            calculateBpm(true); // trueフラグで初回再生を指示
        }
        
        lastStepTimestamp = currentTime;
        stepTimestamps.push(currentTime);
        if (stepTimestamps.length > 5) {
            stepTimestamps.shift();
        }
        
        calculateBpm(false);
    }

    // --- 3. 現在の状態を更新 ---
    // 次のサイクルのために、現在の平均値が閾値を超えているかどうかを保存しておく
    isAboveThreshold = avgMagnitude > PEAK_THRESHOLD;
}


// 音楽を停止し、表示をリセットする専門の関数
function stopMusicAndReset() {
    clearTimeout(scheduler);
    isPlaying = false;
    stepTimestamps.length = 0;
    bpmDisplay.textContent = '--';
    statusElem.textContent = '停止しました。歩行を再開してください。';
    console.log("--- Music Stopped ---");
}

// BPMを丸める関数
function quantizeBpm(rawBpm) {
    if (rawBpm >= 80 && rawBpm < 100) return 90;
    if (rawBpm >= 100 && rawBpm < 120) return 110;
    if (rawBpm >= 120 && rawBpm < 140) return 130;
    if (rawBpm >= 140 && rawBpm < 160) return 150;
    if (rawBpm >= 160 && rawBpm < 180) return 170;
    return null;
}

// BPM計算と反映のロジック
function calculateBpm(isFirstBeat = false) {
    if (stepTimestamps.length < 2 && !isFirstBeat) {
        return;
    }

    if (isFirstBeat && stepTimestamps.length <= 1) {
        resetScheduler(currentBpm);
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
            resetScheduler(currentBpm);
        }
    }
}
// スケジューラーと音再生関数
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
