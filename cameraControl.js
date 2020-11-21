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

let detectRingArea_flag = false;
let detectRingArea = null;
let detectIndexArea = null;
let detectPinkyArea = null;

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

    //await tf.setBackend('cpu'); //wasm|cpu

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
      //console.log(annotations);
      //console.log(annotations.middleFinger[3]);
      //console.log(annotations.ringFinger[3]);
      //console.log(annotations.palmBase[0]);

      //z座標から手の平の傾き算出して、手の回転角取得
      //親指と小指の精度悪そうなので人差し~薬指の3本採用
      //親指
      //var thumb_z0 = annotations.thumb[0][2];
      //var thumb_z1 = annotations.thumb[1][2];
      //var thumb_z2 = annotations.thumb[2][2];
      //var thumb_z3 = annotations.thumb[3][2];
      //console.log(thumb_z0);
      //人差し指
      var index_x0 = annotations.indexFinger[0][0];
      var index_x1 = annotations.indexFinger[1][0];
      var index_x2 = annotations.indexFinger[2][0];
      var index_x3 = annotations.indexFinger[3][0];
      var index_z0 = annotations.indexFinger[0][2];
      var index_z1 = annotations.indexFinger[1][2];
      var index_z2 = annotations.indexFinger[2][2];
      var index_z3 = annotations.indexFinger[3][2];
      //console.log(index_x0);
      //console.log(index_z0);
      //中指
      var middle_x0 = annotations.middleFinger[0][0];
      var middle_x1 = annotations.middleFinger[1][0];
      var middle_x2 = annotations.middleFinger[2][0];
      var middle_x3 = annotations.middleFinger[3][0];
      var middle_z0 = annotations.middleFinger[0][2];
      var middle_z1 = annotations.middleFinger[1][2];
      var middle_z2 = annotations.middleFinger[2][2];
      var middle_z3 = annotations.middleFinger[3][2];
      //console.log(middle_x0);
      //console.log(middle_z0);
      //薬指
      var ring_x0 = annotations.ringFinger[0][0];
      var ring_x1 = annotations.ringFinger[1][0];
      var ring_x2 = annotations.ringFinger[2][0];
      var ring_x3 = annotations.ringFinger[3][0];
      var ring_z0 = annotations.ringFinger[0][2];
      var ring_z1 = annotations.ringFinger[1][2];
      var ring_z2 = annotations.ringFinger[2][2];
      var ring_z3 = annotations.ringFinger[3][2];
      //console.log(ring_x0);
      //console.log(ring_z0);
      //小指
      //var pinky_z0 = annotations.pinky[0][2];
      //var pinky_z1 = annotations.pinky[1][2];
      //var pinky_z2 = annotations.pinky[2][2];
      //var pinky_z3 = annotations.pinky[3][2];
      //console.log(pinky_z0);
      //3本指から角度w算出
      var rad_0 = Math.atan2(index_z0 - ring_z0, index_x0 - ring_x0);
      var w_0 = Math.atan2(index_z0 - ring_z0, index_x0 - ring_x0)* (180 / Math.PI);
      //console.log("w0:" + w_0);
      var rad_1 = Math.atan2(index_z1 - ring_z1, index_x1 - ring_x1);
      var w_1 = Math.atan2(index_z1 - ring_z1, index_x1 - ring_x1)* (180 / Math.PI);
      //console.log("w1:" + w_1);
      var rad_2 = Math.atan2(index_z2 - ring_z2, index_x2 - ring_x2);
      var w_2 = Math.atan2(index_z2 - ring_z2, index_x2 - ring_x2)* (180 / Math.PI);
      //console.log("w2:" + w_2);
      var rad_3 = Math.atan2(index_z3 - ring_z3, index_x3 - ring_x3);
      var w_3 = Math.atan2(index_z3 - ring_z3, index_x3 - ring_x3)* (180 / Math.PI);
      //console.log("w3:" + w_3);

      avg_w = (w_0 + w_1 + w_2 + w_3) / 4;
      //wの増減量が少なそうなのでX倍にする
      fix_w = 1 * avg_w
      //console.log("avg_w:" + avg_w + ", fix_w:" + fix_w);

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
      //console.log("distance:" + distance + ", rotate:" + rotate);
      //2.distanceを一定間隔伸ばし、その先の手首座標
      var x3 = x1 + (distance+100) * Math.cos(radian);
      var y3 = y1 + (distance+100) * Math.sin(radian);
      //console.log("x3:" + x3 + ", y3:" + y3);
      detectWatchArea_flag = true
      detectWatchArea = {x:x3, y:y3, angle:rotate, w:fix_w};


      //指輪の座標推測
      //薬指の根元に近い関節2点を直線で結び、中点に指輪
      //1.薬指の根元に近い関節2点の距離distanceと角度rotate
      x1 = annotations.ringFinger[1][0];
      y1 = annotations.ringFinger[1][1];
      x2 = annotations.ringFinger[0][0];
      y2 = annotations.ringFinger[0][1];
      distance = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
      radian = Math.atan2(y2 - y1, x2 - x1);
      rotate = Math.atan2(y2 - y1, x2 - x1)* (180 / Math.PI);
      //console.log("ring_distance:" + distance + ", ring_rotate:" + rotate);
      //2.薬指の根元に近い関節2点を結んだ直線の中点が指輪座標
      x3 = (x1 + x2) * 0.5;
      y3 = (y1 + y2) * 0.5;
      //console.log("ring_x:" + x3 + ", ring_y:" + y3);
      detectRingArea_flag = true
      detectRingArea = {x:x3, y:y3, angle:rotate, w:fix_w, scale:distance};

      //オクルージョン用に人差し指と小指の座標も推測しておく
      //人差し指
      x1 = annotations.indexFinger[1][0];
      y1 = annotations.indexFinger[1][1];
      x2 = annotations.indexFinger[0][0];
      y2 = annotations.indexFinger[0][1];
      distance = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
      radian = Math.atan2(y2 - y1, x2 - x1);
      rotate = Math.atan2(y2 - y1, x2 - x1)* (180 / Math.PI);
      //console.log("ring_distance:" + distance + ", ring_rotate:" + rotate);
      //2.人差し指の根元に近い関節2点を結んだ直線の中点が指輪と重なる人差し指座標
      x3 = (x1 + x2) * 0.5;
      y3 = (y1 + y2) * 0.5;
      //console.log("ring_x:" + x3 + ", ring_y:" + y3);
      detectIndexArea = {x:x3, y:y3, angle:rotate, w:fix_w};
      //小指
      x1 = annotations.pinky[1][0];
      y1 = annotations.pinky[1][1];
      x2 = annotations.pinky[0][0];
      y2 = annotations.pinky[0][1];
      distance = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
      radian = Math.atan2(y2 - y1, x2 - x1);
      rotate = Math.atan2(y2 - y1, x2 - x1)* (180 / Math.PI);
      //console.log("ring_distance:" + distance + ", ring_rotate:" + rotate);
      //2.小指の根元に近い関節2点を結んだ直線の中点が指輪と重なる小指座標
      x3 = (x1 + x2) * 0.5;
      y3 = (y1 + y2) * 0.5;
      //console.log("ring_x:" + x3 + ", ring_y:" + y3);
      detectPinkyArea = {x:x3, y:y3, angle:rotate, w:fix_w};

    }else{
      detectWatchArea_flag = false;
      detectRingArea_flag = false;
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
  var model2 = null;//指輪

  const loader = new THREE.GLTFLoader();
  loader.load('./obj/Hand_watch.glb', 
    function (gltf) {
      model1 = gltf.scene; // THREE.Group
      model1.name = "Hand_watch"
      model1.visible = false;
      model1.scale.set(2.0, 2.0, 2.0);
      model1.position.set(0.0, 0.0, 0.0);
      //model1.rotation.x = 0.0;
      //model1.rotation.y = -1.5;
      //model1.rotation.z = 0.0;
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
  
  loader.load('./obj/ring.glb',
    function (gltf) {
      model2 = gltf.scene; // THREE.Group
      model2.name = "ring"
      model2.visible = false;
      model2.scale.set(0.02, 0.02, 0.02);
      model2.position.set(0.0, 0.0, 0.0);
      //model2.rotation.x = -1.5;
      //model2.rotation.y = 0;
      //model2.rotation.z = 3.15;
      scene.add(model2);
    },
    // called while loading is progressing
    function (xhr) {
      console.log('ring: ' + (xhr.loaded / xhr.total * 100 ) + '% loaded');
    },
    // called when loading has errors
    function (error) {
      console.log('An error happened');
    }
  );
  //指輪オクルージョン用の円柱追加 colorWrite=falseで色情報無くして深度情報のみ描画できる
  var cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.151,0.151,0.2,50),
    new THREE.MeshPhongMaterial({color: 0xFF0000, opacity: 1.0, transparent: false, colorWrite: false})
  );
  cylinder.position.set(0, 0, 0); //(x,y,z)
  //sceneオブジェクトに追加
  scene.add(cylinder); 

  //指輪オクルージョン 人差し指用円柱追加
  var index_cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.151,0.151,0.5,50),
    new THREE.MeshPhongMaterial({color: 0xFF00FF, opacity: 1.0, transparent: false, colorWrite: false})
  );
  index_cylinder.position.set(-0.1, 0, 0); //(x,y,z)
  //sceneオブジェクトに追加
  scene.add(index_cylinder);

  //指輪オクルージョン 小指用円柱追加
  var pinky_cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.151,0.151,0.5,50),            
    new THREE.MeshPhongMaterial({color: 0xFFFF00, opacity: 1.0, transparent: false, colorWrite: false})
  );
  pinky_cylinder.position.set(0.1, 0, 0); //(x,y,z)
  //sceneオブジェクトに追加
  scene.add(pinky_cylinder);

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
        //console.log(project_x);
        //console.log(project_y);

        //console.log("angle:" + detectWatchArea.angle);

        var radians = THREE.Math.degToRad(40 + detectWatchArea.angle);
        var axis = new THREE.Vector3(-1, -1, -1);
        var rotWorldMatrix = new THREE.Matrix4();
        rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
        rotWorldMatrix.multiply(model1.matrix);
        model1.matrix = rotWorldMatrix;
        model1.quaternion.setFromAxisAngle(axis, radians);

        //console.log(THREE.Math.degToRad(detectRingArea.w));
        model1.rotation.x += 0.1;
        model1.rotation.y += 0.1;
        model1.rotation.z = THREE.Math.degToRad(detectWatchArea.w);
        
        //console.log("rot_x:" + model1.rotation.x);
        //console.log("rot_y:" + model1.rotation.y);
        //console.log("rot_z:" + model1.rotation.z);
        
        model1.position.set(project_x, project_y, 0.0);
        //手の平の抽出角度に応じて3Dモデル回転
        //console.log(THREE.Math.degToRad(detectWatchArea.angle));
        //model1.rotation.y = THREE.Math.degToRad(detectWatchArea.angle);
        
        // ToDo:スマホのセンサ情報用いてスマホの傾きに応じて3Dモデルの奥行きの角度調整
        
        //model1.visible = true;
      } else if(detectWatchArea_flag == false){
        model1.visible = false;
      }

      if(detectRingArea_flag == true){
        //スクリーン座標逆変換 285,235
        //console.log("canvas_size:" + window.innerWidth+ "," + window.innerHeight);
        //console.log("img_size:" + texture.image.width+ "," + texture.image.height);
        //console.log("finger_pos:[", + detectRingArea.x + "," + detectRingArea.y + "]");
        let detectRingArea_sx = detectRingArea.x + 10;
        let detectRingArea_sy = detectRingArea.y + 80;
        let project_x = (detectRingArea_sx * 2 / width) -1.0 -texture.offset.x;
        let project_y = -(detectRingArea_sy * 2 / height) +1.0 +texture.offset.y;
        //console.log("display_pos:[", + project_x + "," + project_y + "]");
        //console.log(project_x);
        //console.log(project_y);
        //console.log("angle:" + detectRingArea.angle);

        console.log("scale:" + detectRingArea.scale);

        var radians = THREE.Math.degToRad(40 + detectRingArea.angle);
        var axis = new THREE.Vector3(-1, -1, -1);
        var rotWorldMatrix = new THREE.Matrix4();
        rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
        rotWorldMatrix.multiply(model2.matrix);
        model2.matrix = rotWorldMatrix;
        model2.quaternion.setFromAxisAngle(axis, radians);

        //console.log(THREE.Math.degToRad(detectRingArea.w));
        model2.rotation.x += 0.2;
        model2.rotation.z = -0.2 + THREE.Math.degToRad(detectRingArea.w);
        model2.position.set(project_x, project_y, 0.0);
        //手の平の抽出角度に応じて3Dモデル回転
        //console.log(THREE.Math.degToRad(detectRingArea.angle));
        //model2.rotation.y = THREE.Math.degToRad(detectRingArea.angle);

        //指輪の位置変更に合わせてオクルージョン用の円柱も位置変更
        cylinder.quaternion.setFromAxisAngle(axis, radians);
        cylinder.position.set(project_x, project_y, 0.0);

        //指輪オクルージョン用に人差し指
        detectRingArea_sx = detectIndexArea.x - 30;
        detectRingArea_sy = detectIndexArea.y + 80;
        project_x = (detectRingArea_sx * 2 / width) -1.0 -texture.offset.x;
        project_y = -(detectRingArea_sy * 2 / height) +1.0 +texture.offset.y;
        radians = THREE.Math.degToRad(40 + detectIndexArea.angle);
        axis = new THREE.Vector3(-1, -1, -1);
        rotWorldMatrix = new THREE.Matrix4();
        rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
        rotWorldMatrix.multiply(index_cylinder.matrix);
        index_cylinder.matrix = rotWorldMatrix;
        index_cylinder.quaternion.setFromAxisAngle(axis, radians);
        //index_cylinder.rotation.x += 0.2;
        //index_cylinder.rotation.z = -0.2 + THREE.Math.degToRad(detectIndexArea.w);
        index_cylinder.position.set(project_x, project_y, 0.0);

        //指輪オクルージョン用に小指
        detectRingArea_sx = detectPinkyArea.x + 40;
        detectRingArea_sy = detectPinkyArea.y + 80;
        project_x = (detectRingArea_sx * 2 / width) -1.0 -texture.offset.x;
        project_y = -(detectRingArea_sy * 2 / height) +1.0 +texture.offset.y;
        radians = THREE.Math.degToRad(40 + detectPinkyArea.angle);
        axis = new THREE.Vector3(-1, -1, -1);
        rotWorldMatrix = new THREE.Matrix4();
        rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
        rotWorldMatrix.multiply(pinky_cylinder.matrix);
        pinky_cylinder.matrix = rotWorldMatrix;
        pinky_cylinder.quaternion.setFromAxisAngle(axis, radians);
        //pinky_cylinder.rotation.x += 0.2;
        //pinky_cylinder.rotation.z = -0.2 + THREE.Math.degToRad(detectPinkyArea.w);
        pinky_cylinder.position.set(project_x, project_y, 0.0);

        // ToDo:スマホのセンサ情報用いてスマホの傾きに応じて3Dモデルの奥行きの角度調整
        // 指の検出領域(各関節点の直線の長さ)に合わせて３Dモデルの拡大縮小
        // 各関節点の直線の長さ = 90でringのscale:0.02
        var model_scaling = detectRingArea.scale / 90;
        console.log("model scaling:" + model_scaling);
        model2.scale.set(0.02 * model_scaling, 0.02 * model_scaling, 0.02 * model_scaling);
        cylinder.scale.set(model_scaling, model_scaling, model_scaling);                      
        index_cylinder.scale.set(model_scaling, model_scaling, model_scaling);                      
        pinky_cylinder.scale.set(model_scaling, model_scaling, model_scaling);
        model2.visible = true;
      } else if(detectRingArea_flag == false){
        model2.visible = false;
      }
    
      // スクリーン座標を取得する
      //const project = model2.position.project(camera);
      //const sx = (width / 2) * (+project.x + 1.0);
      //const sy = (height / 2) * (-project.y + 1.0);
      // スクリーン座標
      //console.log("screen pos:" + sx, sy);
      //model1.position.set(-0.5, 0.0, 0.0);

    
      // ワールド座標を取得する
      //const world = model2.getWorldPosition();
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