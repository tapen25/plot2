// --- DOM要素の取得 ---
const permissionButton = document.getElementById('permission-button');
const statusElem = document.getElementById('status');
const bpmDisplay = document.getElementById('bpm-display');
const bpmContainer = document.getElementById('bpm-container');

// --- Web Audio APIの初期設定 ---
let audioContext;
let scheduler; // 音を鳴らすタイミングを管理するタイマー
let currentBpm = 120.0;

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
    // AudioContextの作成 (ユーザー操作後に実行する必要がある)
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // ユーザー操作で停止されたAudioContextを再開
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    // センサーへのアクセス許可を要求
    requestSensorPermission();

    // UIの更新
    permissionButton.style.display = 'none';
    statusElem.textContent = '歩行を開始してください...';
    bpmContainer.style.display = 'block';
}

// 2. センサーへのアクセス許可を求める
function requestSensorPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        // iOS 13+ の Safari
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
        // Android やその他のブラウザ
        window.addEventListener('devicemotion', handleMotionEvent);
    }
}

// 3. センサーデータを受け取るたびに実行される関数
function handleMotionEvent(event) {
    if (!event.accelerationIncludingGravity) {
        return;
    }

    const acc = event.accelerationIncludingGravity;
    // 3軸の合成ベクトル（力の大きさ）を計算
    const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
    
    // ピーク検出アルゴリズム
    const currentTime = event.timeStamp / 1000; // ミリ秒を秒に変換
    if (
        magnitude > PEAK_THRESHOLD &&
        (currentTime - lastStepTimestamp) > MIN_STEP_INTERVAL
    ) {
        // ピークを検出！ = 1歩とカウント
        lastStepTimestamp = currentTime;
        
        // ステップの時刻を記録
        stepTimestamps.push(currentTime);
        // 古い記録は削除（直近5ステップ分だけ保持）
        if (stepTimestamps.length > 5) {
            stepTimestamps.shift();
        }

        // BPMを再計算して更新
        calculateBpm();
    }
}

// 4. BPMを計算して画面と音楽に反映させる
function calculateBpm() {
    if (stepTimestamps.length < 2) {
        return; // データが足りないと計算できない
    }

    // ステップ間の時間差の平均を計算
    const intervals = [];
    for (let i = 1; i < stepTimestamps.length; i++) {
        intervals.push(stepTimestamps[i] - stepTimestamps[i - 1]);
    }
    const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    if (averageInterval > 0) {
        // BPMに変換
        currentBpm = 60.0 / averageInterval;
        bpmDisplay.textContent = Math.round(currentBpm);
        
        // 音楽スケジューラーをリセット
        resetScheduler();
    }
}

// 5. 計算されたBPMに合わせて音を鳴らすスケジューラー
function resetScheduler() {
    // 既存のタイマーを停止
    if (scheduler) {
        clearTimeout(scheduler);
    }
    
    // 次のビートのタイミングを計算してタイマーをセット
    const beatInterval = 60.0 / currentBpm; // 秒
    
    function schedule() {
        playBeep();
        scheduler = setTimeout(schedule, beatInterval * 1000); // 次のタイマーをセット
    }
    schedule(); // 即時実行
}

// 6. 音を鳴らす関数 (Web Audio API)
function playBeep() {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine'; // サイン波
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // ラの音
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime); // 音量

    // 0.05秒で再生してすぐに止める
    oscillator.start(audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.05);
    oscillator.stop(audioContext.currentTime + 0.05);
}