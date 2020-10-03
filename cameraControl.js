let width = 0;
let height = 0;

// whether streaming video from the camera.
let streaming = false;

let video = document.getElementById("video");
let stream = null;
let vc = null;

let handpose_init = false;
let model, hands = null;

let detectWatchArea_flag = false;
let detectWatchArea = null;

//let info = document.getElementById('info');
//let container = document.getElementById('container');

function startCamera() {
  if (streaming) return;
  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment",
      //width: { min: 800, ideal: 1280, max: 1920 },
      //height: { min: 600, ideal:  720, max: 1080 }
    },
    audio: false
  })
    .then(function(s) {
    stream = s;
    video.srcObject = s;
    video.play();
  })
    .catch(function(err) {
    console.log("An error occured! " + err);
  });

  video.addEventListener("canplay", function(ev){
    if (!streaming) {
      height = video.videoHeight;
      width = video.videoWidth;
      video.setAttribute("width", width);
      video.setAttribute("height", height);
      streaming = true;
      vc = new cv.VideoCapture(video);
    }
    startVideoProcessing();
  }, false);
}

let lastFilter = '';
let src = null;
let dstC1 = null;
let dstC3 = null;
let dstC4 = null;

function startVideoProcessing() {
  if (!streaming) { console.warn("Please startup your webcam"); return; }
  stopVideoProcessing();
  src = new cv.Mat(height, width, cv.CV_8UC4);
  dstC1 = new cv.Mat(height, width, cv.CV_8UC1);
  dstC3 = new cv.Mat(height, width, cv.CV_8UC3);
  dstC4 = new cv.Mat(height, width, cv.CV_8UC4);
  requestAnimationFrame(processVideo);
  addWebGL();
}

async function processVideo() {
  //stats.begin();
  vc.read(src);
  let result;
  result = await detectHandPose(src);
  cv.imshow("canvas", result);
  //stats.end();
  requestAnimationFrame(processVideo);
}

function stopVideoProcessing() {
  if (src != null && !src.isDeleted()) src.delete();
  if (dstC1 != null && !dstC1.isDeleted()) dstC1.delete();
  if (dstC3 != null && !dstC3.isDeleted()) dstC3.delete();
  if (dstC4 != null && !dstC4.isDeleted()) dstC4.delete();
}

function stopCamera() {
  if (!streaming) return;
  stopVideoProcessing();
  video.pause();
  video.srcObject=null;
  stream.getVideoTracks()[0].stop();
  streaming = false;
}

var stats = null;

function opencvIsReady() {
  console.log('OpenCV.js is ready');
  startCamera();
}

let fingerLookupIndices = {
  thumb: [0, 1, 2, 3, 4],
  indexFinger: [0, 5, 6, 7, 8],
  middleFinger: [0, 9, 10, 11, 12],
  ringFinger: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20]
};  // for rendering each finger as a polyline

async function detectHandPose(src) {

  if(handpose_init == false){
    // Load the MediaPipe handpose model assets.
    model = await handpose.load();
 
    // Pass in a video stream to the model to obtain 
    // a prediction from the MediaPipe graph.
    hands = await model.estimateHands(document.querySelector("video"));
 
    // Each hand object contains a `landmarks` property,
    // which is an array of 21 3-D landmarks.
    //hands.forEach(hand => console.log(hand.landmarks));
    handpose_init = true;
  } else {
    // Pass in a video stream to the model to obtain 
    // a prediction from the MediaPipe graph.
    hands = await model.estimateHands(document.querySelector("video"));
 
    // Each hand object contains a `landmarks` property,
    // which is an array of 21 3-D landmarks.
    //hands.forEach(hand => console.log(hand.landmarks));
    //hands.forEach(hand => console.log(hand.annotations));

    //指の座標から時計用の手首、指輪用の薬指のエリア推測する
    if(hands.length > 0) {
      const landmarks = hands[0].landmarks;
      const annotations = hands[0].annotations;
      console.log(annotations);
      console.log(annotations.middleFinger[3]);
      console.log(annotations.palmBase[0]);
      //手首の座標推測
      //中指とpalmの2点を直線で結び、その延長線上に手首
      //1.中指とpalmの距離distanceと角度rotate
      var x1 = annotations.middleFinger[3][0];
      var y1 = annotations.middleFinger[3][1];
      var x2 = annotations.palmBase[0][0];
      var y2 = annotations.palmBase[0][1];
      var distance = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
      var radian = Math.atan2(y2 - y1, x2 - x1);
      var rotate = Math.atan2(y2 - y1, x2 - x1)* (180 / Math.PI);
      console.log("distance:" + distance + ", rotate:" + rotate);
      //2.distanceを一定間隔伸ばし、その先の手首座標
      var x3 = x1 + (distance+100) * Math.cos(radian);
      var y3 = y1 + (distance+100) * Math.sin(radian);
      console.log("x3:" + x3 + ", y3:" + y3);
      detectWatchArea_flag = true
      detectWatchArea = {x:x3, y:y3, angle:rotate};
    }else{
      detectWatchArea_flag = false;
    }

  }

  return src;
  
}

function addWebGL() {
  // init
  var width = window.innerWidth;
  var height = window.innerHeight;

  // Stats
  const stats = new Stats();
  stats.setMode(0);
  stats.domElement.style.position = "absolute";
  stats.domElement.style.left = "0px";
  stats.domElement.style.top  = "0px";
  document.body.appendChild(stats.dom);

  // Set up the main camera
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  camera.position.z = 5;

  const scene = new THREE.Scene();

  // Create lights
  var light = new THREE.PointLight(0xEEEEEE);
  light.position.set(20, 0, 20);
  scene.add(light);
  var lightAmb = new THREE.AmbientLight(0x777777);
  scene.add(lightAmb);
  // 平行光源
  var lightDir = new THREE.DirectionalLight(0xFFFFFF);
  lightDir.intensity = 5; // 光の強さを倍に
  lightDir.position.set(1, 1, 1);
  scene.add(lightDir);

  //ここで3Dモデルをロード
  //今回はglTF形式のものを使用
  var model1 = null;//時計
  var model2 = null;//時計

  const loader = new THREE.GLTFLoader();
  loader.load('./obj/Hand_watch.glb', 
    function (gltf) {
      model1 = gltf.scene; // THREE.Group
      model1.name = "Hand_watch"
      model1.visible = false;
      model1.scale.set(2.0, 2.0, 2.0);
      model1.position.set(0.0, 0.0, 0.0);
      model1.rotation.x = 0.0;
      model1.rotation.y = -1.5;
      model1.rotation.z = 0.0;
      scene.add(model1);
    },
    // called while loading is progressing
    function (xhr) {
      console.log('Hand_watch: ' + (xhr.loaded / xhr.total * 100) + '% loaded');
    },
    // called when loading has errors
    function (error) {
      console.log('An error happened');
    }
  );
  
  loader.load('./obj/Hand_watch.glb',
    function (gltf) {
      model2 = gltf.scene; // THREE.Group
      model2.name = "Hand_watch2"
      model2.visible = false;
      model2.scale.set(1.0, 1.0, 1.0);
      model2.position.set(0.5, 0.0, 0.0);
      model2.rotation.x = -1.4;
      model2.rotation.y = 0;
      model2.rotation.z = 3.3;
      scene.add(model2);
    },
    // called while loading is progressing
    function (xhr) {
      console.log('Hand_watch2: ' + (xhr.loaded / xhr.total * 100 ) + '% loaded');
    },
    // called when loading has errors
    function (error) {
      console.log('An error happened');
    }
  );

  // renderer
  var renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.autoClear = false; // To allow render overlay on top of sprited sphere

  //document.body.appendChild( renderer.domElement );
  document.getElementById("main").appendChild(renderer.domElement);
  renderer.domElement.id = "webgl";
  // カメラ制御
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.update();

  window.addEventListener( 'resize', onWindowResize, false );

  requestAnimationFrame(render);



  function onWindowResize() {

    var resize_width = window.innerWidth;
    var resize_height = window.innerHeight;

    camera.aspect = resize_width / resize_height;
    camera.updateProjectionMatrix();
  
    renderer.setSize( window.innerWidth, window.innerHeight );

  }

  function render(time) {

    time *= 0.001;

    // create camera image
    var texture = new THREE.Texture(document.querySelector('#canvas'));
    texture.needsUpdate = true; 
    scene.background = texture;
    // Set the repeat and offset properties of the background texture
    // to keep the image's aspect correct.
    // Note the image may not have loaded yet.
    const canvasAspect = window.innerWidth / window.innerHeight;
    const imageAspect = texture.image ? texture.image.width / texture.image.height : 1;
    const aspect = imageAspect / canvasAspect;

    texture.offset.x = aspect > 1 ? (1 - 1 / aspect) / 2 : 0;
    texture.repeat.x = aspect > 1 ? 1 / aspect : 1;

    texture.offset.y = aspect > 1 ? 0 : (1 - aspect) / 2;
    texture.repeat.y = aspect > 1 ? 1 : aspect;

    //sprite sample
    //var material = new THREE.SpriteMaterial( { map: texture } );
    //var width = material.map.image.width;
    //var height = material.map.image.height;
    //sprite = new THREE.Sprite( material );
    //sprite.center.set(0.5, 0.5);
    //sprite.scale.set(width, height, 1);
    //sprite.position.set(0, 0, 1); // center

    
    if(model1 != null && model2 != null){
      //console.log(model);
      //model1.visible = false;
      //console.log(detectFootArea_flag);
      if(detectWatchArea_flag == true){
        //スクリーン座標逆変換
        let detectWatchArea_sx = detectWatchArea.x;
        let detectWatchArea_sy = detectWatchArea.y;
        let project_x = (detectWatchArea_sx * 2 / width) -1.0 -texture.offset.x;
        let project_y = -(detectWatchArea_sy * 2 / height) +1.0 +texture.offset.y;
        console.log(project_x);
        console.log(project_y);
        model1.position.set(project_x, project_y-1.5, 0.0);
        //手の平の抽出角度に応じて3Dモデル回転
        console.log(THREE.Math.degToRad(detectWatchArea.angle));
        //model1.rotation.y = THREE.Math.degToRad(detectWatchArea.angle);
        
        // ToDo:スマホのセンサ情報用いてスマホの傾きに応じて3Dモデルの奥行きの角度調整
        
        model1.visible = true;
        //model2.visible = true;
      } else if(detectWatchArea_flag == false){
        model1.visible = false;
        //model2.visible = false;
      }
    
      // スクリーン座標を取得する
      //const project = model1.position.project(camera);
      //const sx = (width / 2) * (+project.x + 1.0);
      //const sy = (height / 2) * (-project.y + 1.0);
      // スクリーン座標
      //console.log("screen pos:" + sx, sy);
      //model1.position.set(-0.5, 0.0, 0.0);

    
      // ワールド座標を取得する
      //const world = model1.getWorldPosition();
      // ワールド座標
      //console.log(world);

    }
    

    stats.update(); // 毎フレームごとにstats.update()を呼ぶ必要がある。

    renderer.clear();
    renderer.clearDepth();
    renderer.render( scene, camera );
    requestAnimationFrame(render);
  }
  
}