// --- DOM要素の取得 ---
const permissionButton = document.getElementById('permission-button');
const statusElem = document.getElementById('status');
const bpmDisplay = document.getElementById('bpm-display');
const bpmContainer = document.getElementById('bpm-container');

// --- Web Audio APIの初期設定 ---
let audioContext;
let scheduler; // 音を鳴らすタイミングを管理するタイマー

// ▼▼▼ 変更 ▼▼▼
// currentBpmの初期値を丸めた値に設定
let currentBpm = 130.0; 

// --- 歩行検出のためのパラメータ ---
const SENSOR_FREQUENCY = 60; // センサーの更新頻度 (Hz)
const GRAVITY = 9.80665; // 重力加速度
let lastStepTimestamp = 0;
const stepTimestamps = []; // 直近のステップ時刻を記録する配列
const PEAK_THRESHOLD = 11.5; // 歩行ピークと判定する加速度の閾値 (m/s^2)
const MIN_STEP_INTERVAL = 0.25; // 最短ステップ間隔 (秒) これより短い間隔のピークは無視


// --- メインの処理 ---

// 1. ユーザーのアクションをトリガーに初期化
permissionButton.addEventListener('click', init);

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
    
    // ▼▼▼ 変更 ▼▼▼
    // 初期BPM表示とスケジューラー開始
    bpmDisplay.textContent = Math.round(currentBpm);
    resetScheduler();
}

// 2. センサーへのアクセス許可を求める (変更なし)
function requestSensorPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleMotionEvent);
                } else {
                    statusElem.textContent = 'センサーへのアクセスが拒否されました。';
                }
            })
            .catch(console.error);
    } else {
        window.addEventListener('devicemotion', handleMotionEvent);
    }
}

// 3. センサーデータを受け取るたびに実行される関数 (変更なし)
function handleMotionEvent(event) {
    if (!event.accelerationIncludingGravity) {
        return;
    }
    const acc = event.accelerationIncludingGravity;
    const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
    
    const currentTime = event.timeStamp / 1000;
    if (
        magnitude > PEAK_THRESHOLD &&
        (currentTime - lastStepTimestamp) > MIN_STEP_INTERVAL
    ) {
        lastStepTimestamp = currentTime;
        stepTimestamps.push(currentTime);
        if (stepTimestamps.length > 5) {
            stepTimestamps.shift();
        }
        calculateBpm();
    }
}

// ▼▼▼ 追加 ▼▼▼
// 4. BPMを丸める（量子化する）専門の関数
function quantizeBpm(rawBpm) {
    if (rawBpm >= 80 && rawBpm < 100) return 90;
    if (rawBpm >= 100 && rawBpm < 120) return 110;
    if (rawBpm >= 120 && rawBpm < 140) return 130;
    if (rawBpm >= 140 && rawBpm < 160) return 150;
    if (rawBpm >= 160 && rawBpm < 180) return 170;
    
    // どの範囲にも当てはまらない場合は、nullを返す
    return null; 
}


// ▼▼▼ 変更 ▼▼▼
// 5. BPM計算と反映のロジックを更新
function calculateBpm() {
    if (stepTimestamps.length < 2) {
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

        // 丸めたBPMが有効で、かつ現在のBPMと違う場合のみ更新
        if (quantizedBpm !== null && quantizedBpm !== currentBpm) {
            currentBpm = quantizedBpm; // 現在のBPMを更新
            bpmDisplay.textContent = Math.round(currentBpm);
            resetScheduler(); // テンポが変わったのでスケジューラーをリセット
            console.log(`BPM changed to: ${currentBpm}`); // 動作確認用のログ
        }
    }
}


// 6. スケジューラーと音再生関数 (変更なし)
function resetScheduler() {
    if (scheduler) {
        clearTimeout(scheduler);
    }
    
    const beatInterval = 60.0 / currentBpm;
    
    function schedule() {
        playBeep();
        scheduler = setTimeout(schedule, beatInterval * 1000);
    }
    schedule();
}

function playBeep() {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);

    oscillator.start(audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.05);
    oscillator.stop(audioContext.currentTime + 0.05);
}
