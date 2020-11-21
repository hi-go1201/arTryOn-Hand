// whether streaming video from the camera.
let streaming = false;

let video = document.getElementById("video");
let stream = null;
let vc = null;
let src = null;

let stats = null;

let handpose_init = false;
let model, hands = null;

let detectWatchArea_flag = false;
let detectWatchArea = null;

let detectRingArea_flag = false;
let detectRingArea = null;

let detectIndexFingerArea, detectPinkyFingerArea = null;

function opencvIsReady() {
  console.log('OpenCV.js is ready');
  startCamera();
}

function startCamera() {
  if (streaming) return;
  console.log("display_size:" + window.innerWidth+ "," + window.innerHeight);
  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment",
      width: window.innerWidth,
      height: window.innerHeight,
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

function startVideoProcessing() {
  if (!streaming) { console.warn("Please startup your webcam"); return; }
  src = new cv.Mat(height, width, cv.CV_8UC4);
  requestAnimationFrame(processVideo);
  addWebGL();
}

async function processVideo() {
  //stats.begin();
  vc.read(src);
  await detectHandPose();
  cv.imshow("canvas", src);
  //stats.end();
  requestAnimationFrame(processVideo);
}

let fingerLookupIndices = {
  thumb: [0, 1, 2, 3, 4],
  indexFinger: [0, 5, 6, 7, 8],
  middleFinger: [0, 9, 10, 11, 12],
  ringFinger: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20]
};  // for rendering each finger as a polyline

async function detectHandPose() {
  if(handpose_init == false){
    //await tf.setBackend('cpu'); //wasm|cpu

    // Load the MediaPipe handpose model assets.
    model = await handpose.load();
 
    // Pass in a video stream to the model to obtain 
    // a prediction from the MediaPipe graph.
    hands = await model.estimateHands(document.querySelector("video"));
    handpose_init = true;

  }else{
    // Pass in a video stream to the model to obtain 
    // a prediction from the MediaPipe graph.
    hands = await model.estimateHands(document.querySelector("video"));
 
    // Each hand object contains a `landmarks` property,
    // which is an array of 21 3-D landmarks.
    //hands.forEach(hand => console.log(hand.landmarks));
    //hands.forEach(hand => console.log(hand.annotations));

    //各指の座標から時計用の手首、指輪用の薬指のエリア推測する
    if(hands.length > 0) {
      //処理に必要な各指の座標を取得
      const annotations = hands[0].annotations;
      
      //人差し指と薬指の各関節位置を基準に指の平均回転角度w算出
      var fix_w = calcHandRotate(annotations.indexFinger, annotations.ringFinger);

      //腕時計の座標/回転/傾き/スケール(距離)推測
      var watchPos = detectHandWatchPos(annotations);
      detectWatchArea = {x:watchPos.x, y:watchPos.y, w:fix_w, angle:watchPos.angle, distance:watchPos.distance};
      detectWatchArea_flag = true;

      //指輪の座標/回転/傾き/スケール(距離)推測
      var ringPos = detectRingPos(annotations.ringFinger);
      detectRingArea = {x:ringPos.x, y:ringPos.y, w:fix_w, angle:ringPos.angle, distance:ringPos.distance};
      detectRingArea_flag = true

      //オクルージョン用に人差し指と小指の座標/回転/傾き/スケール(距離)推測
      //人差し指
      var indexFingerPos = detectRingPos(annotations.indexFinger);
      detectIndexFingerArea = {x:indexFingerPos.x, y:indexFingerPos.y, w:fix_w, angle:indexFingerPos.angle, distance:indexFingerPos.distance};
      //小指
      var pinkyFingerPos = detectRingPos(annotations.pinky);
      detectPinkyFingerArea = {x:pinkyFingerPos.x, y:pinkyFingerPos.y, w:fix_w, angle:pinkyFingerPos.angle, distance:pinkyFingerPos.distance};

    }else{
      detectWatchArea_flag = false;
      detectRingArea_flag = false;
    }

  }
}

//2本の指の各関節位置を基準に指の平均回転角度w算出
function calcHandRotate(finger1, finger2){
  //人差し指
  var finger1_x0 = finger1[0][0];
  var finger1_x1 = finger1[1][0];
  var finger1_x2 = finger1[2][0];
  var finger1_x3 = finger1[3][0];
  var finger1_z0 = finger1[0][2];
  var finger1_z1 = finger1[1][2];
  var finger1_z2 = finger1[2][2];
  var finger1_z3 = finger1[3][2];
  //薬指
  var finger2_x0 = finger2[0][0];
  var finger2_x1 = finger2[1][0];
  var finger2_x2 = finger2[2][0];
  var finger2_x3 = finger2[3][0];
  var finger2_z0 = finger2[0][2];
  var finger2_z1 = finger2[1][2];
  var finger2_z2 = finger2[2][2];
  var finger2_z3 = finger2[3][2];

  //人差し指と薬指の各関節位置を基準に指の平均回転角度w算出
  var w_0 = Math.atan2(finger1_z0 - finger2_z0, finger1_x0 - finger2_x0) * (180 / Math.PI);
  var w_1 = Math.atan2(finger1_z1 - finger2_z1, finger1_x1 - finger2_x1) * (180 / Math.PI);
  var w_2 = Math.atan2(finger1_z2 - finger2_z2, finger1_x2 - finger2_x2) * (180 / Math.PI);
  var w_3 = Math.atan2(finger1_z3 - finger2_z3, finger1_x3 - finger2_x3) * (180 / Math.PI);

  var avg_w = (w_0 + w_1 + w_2 + w_3) / 4;
  //wの増減量が少なそうなのでX倍にする
  var fix_w = 1 * avg_w
  //console.log("avg_w:" + avg_w + ", fix_w:" + fix_w);
  return fix_w;
}

//手首の座標/傾き/スケール(距離)推測：中指とpalmの2点を直線で結び、その延長線上に手首
function detectHandWatchPos(annotations){
  //1.中指とpalmの距離distanceと角度rotate
  var x1 = annotations.middleFinger[3][0];
  var y1 = annotations.middleFinger[3][1];
  var x2 = annotations.palmBase[0][0];
  var y2 = annotations.palmBase[0][1];
  var distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  var radian = Math.atan2(y2 - y1, x2 - x1);
  var angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
  
  //2.distanceを一定間隔伸ばし、その先の手首座標
  var target_x = x1 + (distance + 100) * Math.cos(radian);
  var target_y = y1 + (distance + 100) * Math.sin(radian);
  //console.log("HandWatch_x:" + target_x + ", HandWatch_y:" + target_y + ", HandWatch_distance:" + distance + ", HandWatch_angle:" + angle);
  return {x:target_x, y:target_y, angle:angle, distance:distance};
}

//指輪の座標/傾き/スケール(距離)推測：該当する指の根元に近い関節2点を直線で結び、中点に指輪
function detectRingPos(finger){
  //1.該当する指の根元に近い関節2点の距離distanceと角度rotate
  var x1 = finger[1][0];
  var y1 = finger[1][1];
  var x2 = finger[0][0];
  var y2 = finger[0][1];
  var distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  var angle = Math.atan2(y2 - y1, x2 - x1)* (180 / Math.PI);
  
  //2.該当する指の根元に近い関節2点を結んだ直線の中点が指輪座標
  var target_x = (x1 + x2) * 0.5;
  var target_y = (y1 + y2) * 0.5;
  //console.log("ring_x:" + target_x + ", ring_y:" + target_y + ", ring_distance:" + distance + ", ring_angle:" + angle);
  return {x:target_x, y:target_y, angle:angle, distance:distance};
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
  
  //時計オクルージョン用の円柱追加 colorWrite=falseで色情報無くして深度情報のみ描画できる
  var watch_cylinder = new THREE.Mesh(                                     
    new THREE.CylinderGeometry(0.348,0.348,1.0,50),                         
    new THREE.MeshPhongMaterial({color: 0x00FF00, opacity: 1.0, transparent: false, colorWrite: false})
  );
  watch_cylinder.position.set(0, 0.5, -0.15); //(x,y,z)
  watch_cylinder.rotation.z = 1.57
  //sceneオブジェクトに追加
  scene.add(watch_cylinder);    

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
    new THREE.MeshPhongMaterial({color: 0xFF0000, opacity: 1.0, transparent: false, colorWrite: true})
  );
  cylinder.position.set(0, 0, 0); //(x,y,z)
  //sceneオブジェクトに追加
  scene.add(cylinder); 

  //指輪オクルージョン 人差し指用円柱追加
  var index_cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.151,0.151,0.5,50),
    new THREE.MeshPhongMaterial({color: 0xFF00FF, opacity: 1.0, transparent: false, colorWrite: true})
  );
  index_cylinder.position.set(-0.1, 0, 0); //(x,y,z)
  //sceneオブジェクトに追加
  scene.add(index_cylinder);

  //指輪オクルージョン 小指用円柱追加
  var pinky_cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.151,0.151,0.5,50),            
    new THREE.MeshPhongMaterial({color: 0xFFFF00, opacity: 1.0, transparent: false, colorWrite: true})
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

        //手首の位置変更に合わせてオクルージョン用の円柱も位置変更
        watch_cylinder.position.set(project_x, project_y, -0.15);
        watch_cylinder.quaternion.setFromAxisAngle(axis, radians);
        watch_cylinder.quaternion.multiply(watch_cylinder.quaternion.setFromAxisAngle(axis, radians));
        watch_cylinder.rotation.z = 1.57

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
        console.log("canvas_size:" + window.innerWidth+ "," + window.innerHeight);
        console.log("img_size:" + texture.image.width+ "," + texture.image.height);
        console.log("finger_pos:[", + detectRingArea.x + "," + detectRingArea.y + "]");
        let detectRingArea_sx = detectRingArea.x + 10;
        let detectRingArea_sy = detectRingArea.y + 80;
        let project_x = (detectRingArea_sx * 2 / width) -1.0 -texture.offset.x;
        let project_y = -(detectRingArea_sy * 2 / height) +1.0 +texture.offset.y;
        //console.log("display_pos:[", + project_x + "," + project_y + "]");
        //console.log(project_x);
        //console.log(project_y);
        //console.log("angle:" + detectRingArea.angle);
        //console.log("distance:" + detectRingArea.distance);

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
        detectRingArea_sx = detectIndexFingerArea.x - 30;
        detectRingArea_sy = detectIndexFingerArea.y + 80;
        project_x = (detectRingArea_sx * 2 / width) -1.0 -texture.offset.x;
        project_y = -(detectRingArea_sy * 2 / height) +1.0 +texture.offset.y;
        radians = THREE.Math.degToRad(40 + detectIndexFingerArea.angle);
        axis = new THREE.Vector3(-1, -1, -1);
        rotWorldMatrix = new THREE.Matrix4();
        rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
        rotWorldMatrix.multiply(index_cylinder.matrix);
        index_cylinder.matrix = rotWorldMatrix;
        index_cylinder.quaternion.setFromAxisAngle(axis, radians);
        //index_cylinder.rotation.x += 0.2;
        //index_cylinder.rotation.z = -0.2 + THREE.Math.degToRad(detectIndexFingerArea.w);
        index_cylinder.position.set(project_x, project_y, 0.0);

        //指輪オクルージョン用に小指
        detectRingArea_sx = detectPinkyFingerArea.x + 40;
        detectRingArea_sy = detectPinkyFingerArea.y + 80;
        project_x = (detectRingArea_sx * 2 / width) -1.0 -texture.offset.x;
        project_y = -(detectRingArea_sy * 2 / height) +1.0 +texture.offset.y;
        radians = THREE.Math.degToRad(40 + detectPinkyFingerArea.angle);
        axis = new THREE.Vector3(-1, -1, -1);
        rotWorldMatrix = new THREE.Matrix4();
        rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
        rotWorldMatrix.multiply(pinky_cylinder.matrix);
        pinky_cylinder.matrix = rotWorldMatrix;
        pinky_cylinder.quaternion.setFromAxisAngle(axis, radians);
        //pinky_cylinder.rotation.x += 0.2;
        //pinky_cylinder.rotation.z = -0.2 + THREE.Math.degToRad(detectPinkyFingerArea.w);
        pinky_cylinder.position.set(project_x, project_y, 0.0);

        // ToDo:スマホのセンサ情報用いてスマホの傾きに応じて3Dモデルの奥行きの角度調整
        // 指の検出領域(各関節点の直線の長さ)に合わせて３Dモデルの拡大縮小
        // 各関節点の直線の長さ = 90でringのscale:0.02
        var model_scaling = detectRingArea.distance / 90;
        //console.log("model scaling:" + model_scaling);
        model2.scale.set(0.02 * model_scaling, 0.02 * model_scaling, 0.02 * model_scaling);
        //console.log("model2 scale:" + model2.scale.x);
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