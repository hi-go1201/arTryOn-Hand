// whether streaming video from the camera.
let streaming = false;

let video = document.getElementById("video");
let stream = null;
let vc = null;
let src = null;

let stats = null;

let handpose_init = false;
let handmodel, hands = null;

let detectWatchArea_flag = false;
let detectWatchArea = null;

let detectRingArea_flag = false;
let detectRingArea = null;

let detectMiddleFingerArea, detectPinkyFingerArea = null;

function opencvIsReady() {
  console.log('OpenCV.js is ready');
  startCamera();
}

//iosで動かない原因調査→audio:false, video要素にplaysinline属性が必須、video.play()必須。autoplay属性だけでは動かない場合あり
//camera解像度一定にしても動かない？要追加調査
function startCamera() {
  if (streaming) return;
  console.log("display_size:" + window.innerWidth+ "," + window.innerHeight);
  if ( navigator.mediaDevices && navigator.mediaDevices.getUserMedia ) {

    const constraints = { video: { width: 1280, height: 720, facingMode: 'environment' } };

    navigator.mediaDevices.getUserMedia( constraints ).then( function ( stream ) {

      // apply the stream to the video element used in the texture

      video.srcObject = stream;
      video.play();

    } ).catch( function ( error ) {

      console.error( 'Unable to access the camera/webcam.', error );

    } );

  } else {

    console.error( 'MediaDevices interface not available.' );

  }

  video.addEventListener("canplay", function(ev){
    if (!streaming) {
      console.log("video_size:" + video.videoWidth+ "," + video.videoHeight);
      width = video.videoWidth;
      height = video.videoHeight;
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
  src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
  requestAnimationFrame(processVideo);
  addWebGL();
}

async function processVideo() {
  //stats.begin();
  vc.read(src);
  //スマホ用にvideoソースの解像度修正
  let dst = new cv.Mat();
  let adjustVideoSrc = new cv.Mat();

  //videoソースが画面解像度より小さい時の事前修正が必要(PC,ipadでありがち)
  if(window.innerWidth > video.videoWidth){
    //横揃える
    var adjustVideoHeight = parseInt(video.videoHeight * (window.innerWidth / video.videoWidth));
    console.log("adjust_video_size:" + window.innerWidth + "," + adjustVideoHeight);
    var adjustVideoSize = new cv.Size(window.innerWidth, adjustVideoHeight);
    cv.resize(src, adjustVideoSrc, adjustVideoSize, 0, 0, cv.INTER_AREA);
    //縦クロップして揃える
    var  x1 = parseInt((adjustVideoSrc.cols / 2) - (window.innerWidth / 2));
    var  y1 = parseInt((adjustVideoSrc.rows / 2) - (window.innerHeight / 2));
    let rect = new cv.Rect(x1, y1, window.innerWidth, window.innerHeight);
    dst = adjustVideoSrc.roi(rect);
  }else if(window.innerHeight > video.videoHeight){
    //縦揃える
    var adjustVideoWidth = parseInt(video.videoWidth * (window.innerHeight / video.videoHeight));
    console.log("adjust_video_size:" + adjustVideoWidth + "," + window.innerHeight);
    var adjustVideoSize = new cv.Size(adjustVideoWidth, window.innerHeight);
    cv.resize(src, adjustVideoSrc, adjustVideoSize, 0, 0, cv.INTER_AREA);
    //横クロップして揃える
    var  x1 = parseInt((adjustVideoSrc.cols / 2) - (window.innerWidth / 2));
    var  y1 = parseInt((adjustVideoSrc.rows / 2) - (window.innerHeight / 2));
    let rect = new cv.Rect(x1, y1, window.innerWidth, window.innerHeight);
    dst = adjustVideoSrc.roi(rect);
  }else{
    console.log("adjust_video_size:" + window.innerWidth + "," + window.innerHeight);
    var  x1 = parseInt((video.videoWidth / 2) - (window.innerWidth / 2));
    var  y1 = parseInt((video.videoHeight / 2) - (window.innerHeight / 2));
    let rect = new cv.Rect(x1, y1, window.innerWidth, window.innerHeight);
    dst = src.roi(rect);
  }
  
  //cv.imshow('canvas', dst);
  adjustVideoSrc.delete();
  dst.delete();
  //await detectHandPose();
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
    handmodel = await handpose.load();
 
    // Pass in a video stream to the model to obtain 
    // a prediction from the MediaPipe graph.
    hands = await handmodel.estimateHands(document.getElementById("canvas"));
    handpose_init = true;

    console.log("canvasInfo:" + document.getElementById("canvas").width + "," + document.getElementById("canvas").height);

  }else{
    // Pass in a video stream to the model to obtain 
    // a prediction from the MediaPipe graph.
    hands = await handmodel.estimateHands(document.getElementById("canvas"));
 
    // Each hand object contains a `landmarks` property,
    // which is an array of 21 3-D landmarks.
    hands.forEach(hand => console.log(hand.landmarks));
    hands.forEach(hand => console.log(hand.annotations));

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
      //中指
      var middleFingerPos = detectRingPos(annotations.middleFinger);
      detectMiddleFingerArea = {x:middleFingerPos.x, y:middleFingerPos.y, z:middleFingerPos.z, w:fix_w, angle:middleFingerPos.angle, distance:middleFingerPos.distance};
      //小指
      var pinkyFingerPos = detectRingPos(annotations.pinky);
      detectPinkyFingerArea = {x:pinkyFingerPos.x, y:pinkyFingerPos.y, z:pinkyFingerPos.z, w:fix_w, angle:pinkyFingerPos.angle, distance:pinkyFingerPos.distance};

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

//指輪の座標/傾き/深度/スケール(距離)推測：該当する指の根元に近い関節2点を直線で結び、中点に指輪
function detectRingPos(finger){
  //1.該当する指の根元に近い関節2点の距離distanceと角度rotate
  var x1 = finger[1][0];
  var y1 = finger[1][1];
  var z1 = finger[1][2];
  var x2 = finger[0][0];
  var y2 = finger[0][1];
  var z2 = finger[0][2];

  var distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  var angle = Math.atan2(y2 - y1, x2 - x1)* (180 / Math.PI);
  
  //2.該当する指の根元に近い関節2点を結んだ直線の中点が指輪座標
  var target_x = (x1 + x2) * 0.5;
  var target_y = (y1 + y2) * 0.5;
  var target_z = (z1 + z2) * 0.5;
  //console.log("target_x:" + target_x + ", target_y:" + target_y + ", target_z:" + target_z + ", target_distance:" + distance + ", target_angle:" + angle);
  return {x:target_x, y:target_y, z:target_z, angle:angle, distance:distance};
}

function addWebGL() {
  // Stats
  const stats = new Stats();
  stats.setMode(0);
  stats.domElement.style.position = "absolute";
  stats.domElement.style.left = "0px";
  stats.domElement.style.top  = "0px";
  document.body.appendChild(stats.dom);

  // Set up the main camera
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 2;

  const scene = new THREE.Scene();


  // create camera image
  const texture = new THREE.VideoTexture( video );

	const geometry = new THREE.PlaneBufferGeometry( 16, 9 );
	geometry.scale( 0.5, 0.5, 0.5 );
	const material = new THREE.MeshBasicMaterial( { map: texture } );

	const count = 128;
	const radius = 32;

	for ( let i = 1, l = count; i <= l; i ++ ) {

			const phi = Math.acos( - 1 + ( 2 * i ) / l );
			const theta = Math.sqrt( l * Math.PI ) * phi;

			const mesh = new THREE.Mesh( geometry, material );
			mesh.position.setFromSphericalCoords( radius, phi, theta );
			mesh.lookAt( camera.position );
			scene.add( mesh );

	}

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

  //3Dモデルをロード。今回はglTF形式を使用  
  const loader = new THREE.GLTFLoader();

  /*
  //腕時計(loadに時間かかるので初期値null)
  var model_HandWatch = null;
  loader.load('./obj/Hand_watch.glb', 
    function (gltf) {
      model_HandWatch = gltf.scene; // THREE.Group
      model_HandWatch.name = "HandWatch"
      model_HandWatch.visible = false;
      model_HandWatch.scale.set(2.0, 2.0, 2.0);
      model_HandWatch.position.set(0.0, 0.0, 0.0);
      //model_HandWatch.rotation.x = 0.0;
      //model_HandWatch.rotation.y = -1.5;
      //model_HandWatch.rotation.z = 0.0;
      scene.add(model_HandWatch);
    },
    // called while loading is progressing
    function (xhr) {
      console.log('HandWatch: ' + (xhr.loaded / xhr.total * 100) + '% loaded');
    },
    // called when loading has errors
    function (error) {
      console.log('An error happened');
    }
  );
  
  //腕時計オクルージョン用の円柱追加 colorWrite=falseで色情報無くして深度情報のみ描画できる
  var watch_cylinder = new THREE.Mesh(                                     
    new THREE.CylinderGeometry(0.348,0.348,1.0,50),                         
    new THREE.MeshPhongMaterial({color: 0x00FF00, opacity: 1.0, transparent: false, colorWrite: false})
  );
  watch_cylinder.position.set(0, 0.5, -0.15); //(x,y,z)
  watch_cylinder.rotation.z = 1.57
  //sceneオブジェクトに追加
  scene.add(watch_cylinder);
  */

  //指輪(loadに時間かかるので初期値null)
  var model_Ring = null;
  loader.load('./obj/ring.glb',
    function (gltf) {
      model_Ring = gltf.scene; // THREE.Group
      model_Ring.name = "ring"
      model_Ring.visible = false;
      model_Ring.scale.set(0.01, 0.01, 0.01);
      model_Ring.position.set(0.0, 0.0, 0.0);
      model_Ring.rotation.x = -1.55;
      model_Ring.rotation.y = 0;
      model_Ring.rotation.z = 3.15;
      model_Ring.view = null;
      scene.add(model_Ring);
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
  var ring_cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08,0.08,0.08,50),
    new THREE.MeshPhongMaterial({color: 0xFF0000, opacity: 1.0, transparent: false, colorWrite: false})
  );
  ring_cylinder.position.set(0, 0, 0); //(x,y,z)
  //sceneオブジェクトに追加
  scene.add(ring_cylinder); 

  //指輪オクルージョン 中指用円柱追加
  var middle_cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07,0.07,0.3,50),
    new THREE.MeshPhongMaterial({color: 0xFF00FF, opacity: 1.0, transparent: false, colorWrite: false})
  );
  middle_cylinder.position.set(-0.1, 0, 0); //(x,y,z)
  //sceneオブジェクトに追加
  scene.add(middle_cylinder);

  //指輪オクルージョン 小指用円柱追加
  var pinky_cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08,0.08,0.5,50),
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
  document.body.appendChild( renderer.domElement );

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

    




    /*
    var texture = new THREE.Texture(document.getElementById('canvas'));
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
    */
    //renderHandWatch(model_HandWatch, watch_cylinder, detectWatchArea, texture, detectWatchArea_flag);
    renderRing(model_Ring, ring_cylinder, detectRingArea, texture, detectRingArea_flag);
    //if(model_Ring!=null)model_Ring.position.set(0.0, 0.0, 0.0);
    
    //手首の回転に応じて深さ変更。中指と小指のmodel_info.zの大きさに応じて円柱のposition.zを微修正
    if(detectMiddleFingerArea != null){
      renderFingerOcclusion(middle_cylinder, detectMiddleFingerArea, texture);
    }
    if(detectPinkyFingerArea != null){
      renderFingerOcclusion(pinky_cylinder, detectPinkyFingerArea, texture);
    }

    stats.update(); // 毎フレームごとにstats.update()を呼ぶ必要がある。

    //renderer.clear();
    //renderer.clearDepth();
    requestAnimationFrame(render);
    renderer.render( scene, camera );
    //requestAnimationFrame(render);
  }

  function renderHandWatch(model, cylinder, model_info, texture, flag){
    if(model != null){
      //console.log(model);
      //console.log(flag);
      if(flag == true){
        //スクリーン座標逆変換
        let detectWatchArea_sx = model_info.x;
        let detectWatchArea_sy = model_info.y;
        let project_x = (detectWatchArea_sx * 2 / width) -1.0 -texture.offset.x;
        let project_y = -(detectWatchArea_sy * 2 / height) +1.0 +texture.offset.y;
        //console.log(project_x);
        //console.log(project_y);

        //console.log("angle:" + detectWatchArea.angle);

        var radians = THREE.Math.degToRad(40 + model_info.angle);
        var axis = new THREE.Vector3(-1, -1, -1);
        var rotWorldMatrix = new THREE.Matrix4();
        rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
        rotWorldMatrix.multiply(model.matrix);
        model.matrix = rotWorldMatrix;
        model.quaternion.setFromAxisAngle(axis, radians);

        //console.log(THREE.Math.degToRad(detectRingArea.w));
        model.rotation.x += 0.1;
        model.rotation.y += 0.1;
        model.rotation.z = THREE.Math.degToRad(model_info.w);
        
        //console.log("rot_x:" + model_HandWatch.rotation.x);
        //console.log("rot_y:" + model_HandWatch.rotation.y);
        //console.log("rot_z:" + model_HandWatch.rotation.z);
        
        model.position.set(project_x, project_y, 0.0);

        //手首の位置変更に合わせてオクルージョン用の円柱も位置変更
        cylinder.position.set(project_x, project_y, -0.15);
        cylinder.quaternion.setFromAxisAngle(axis, radians);
        cylinder.quaternion.multiply(cylinder.quaternion.setFromAxisAngle(axis, radians));
        cylinder.rotation.z = 1.57

        //手の平の抽出角度に応じて3Dモデル回転
        //console.log(THREE.Math.degToRad(detectWatchArea.angle));
        //model_HandWatch.rotation.y = THREE.Math.degToRad(detectWatchArea.angle);
        
        // ToDo:スマホのセンサ情報用いてスマホの傾きに応じて3Dモデルの奥行きの角度調整
        
        model_HandWatch.visible = true;
      } else if(flag == false){
        model.visible = false;
      }
    }
  }

  function renderRing(model, cylinder, model_info, texture, flag){
    const width = window.innerWidth; // rendererのサイズ
    const height = window.innerHeight;
    if(model != null){
      //console.log(model);
      //console.log(model_info);
      if(flag == true){
        // 5.指の検出領域(各関節点の直線の長さ)に合わせて３Dモデルの拡大縮小
        // 各関節点の直線の長さ = 93.396でringのscale:0.01
        var scaling = model_info.distance / 110;
        //console.log("model scaling:" + model_scaling);
        model.scale.set(0.01 * scaling, 0.01 * scaling, 0.01 * scaling);
        cylinder.scale.set(scaling, scaling, scaling);

        // 1.指の座標を3D空間座標に変換 0:-0.4,196.5:0.0,392:0.4
        // 左右のpositionが−1~1じゃない場合にパラメータ調整必要。現状はpixel3aに最適化
        console.log("finger_pos:[", + model_info.x + "," + model_info.y + "]");
        var finger3Dx =  (model_info.x * 2 / width) - 1.0;
        var finger3Dy = -(model_info.y * 2 / height) + 1.0;
        console.log("finger3Dpos:[", + finger3Dx*0.5 + "," + finger3Dy + "]"); 
        
        // 2.指輪を指の検出座標に移動
        model.position.set(finger3Dx*0.5, finger3Dy, -0.02);
        //console.log("angle:" + model_info.angle);
        //console.log("distance:" + model_info.distance);

        // 3.手首の回転軸に応じて指輪の軸を回転
        var radians = THREE.Math.degToRad(model_info.angle + 40);
        //console.log("angle:" + model_info.angle + 40);

        var axis = new THREE.Vector3(-1, -1, -1);
        var rotWorldMatrix = new THREE.Matrix4();
        rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
        rotWorldMatrix.multiply(model.matrix);
        model.matrix = rotWorldMatrix;
        model.quaternion.setFromAxisAngle(axis, radians);

        // 4.指の回転角度に応じて指輪回転
        //指輪の認識復帰時に表裏状態設定(指輪正面-180度、後ろ0度、可動範囲-180~180度)
        if(model.view == null && Math.abs(model_info.w) >= 0.5 && Math.abs(model_info.w) <= 60){
          model.view = 'rear';
        }else if(model.view == null && Math.abs(model_info.w) >= 120 && Math.abs(model_info.w) <= 180){
          model.view = 'front';
        }
        //console.log("Ring_status:" + model.view);
        //console.log("hand_w:" + model_info.w);
        
        //rear時はfrontにさせない
        if(model.view == 'rear'){
          if(Math.abs(model_info.w) >= 0 && Math.abs(model_info.w) <= 60){
            model.rotation.z = THREE.Math.degToRad(model_info.w);
          }else{
            model.rotation.z = 0.00;
          }
        }
        //front時はrearにさせない
        if(model.view == 'front'){
          if(Math.abs(model_info.w) >= 70 && Math.abs(model_info.w) <= 180){
            model.rotation.z = THREE.Math.degToRad(model_info.w);
          }else{
            model.rotation.z = 3.15;
          }
        }
        //console.log("rotated_ring_z:" + model.rotation.z);

        
        //console.log("model_Ring scale:" + model.scale.x);

        // 6.指輪の位置変更に合わせてオクルージョン用の円柱も位置変更
        //パラメータ：90:0, 180:1.55→155/90 = 1.72
        cylinder.position.set(finger3Dx*0.5, finger3Dy, -0.02);
        cylinder.rotation.set(0,0,(90-model_info.angle)*0.0172);
        //console.log(cylinder.rotation.z);

        model.visible = true;
      } else if(flag == false){
        model.visible = false;
        //指輪のロスト時、表裏状態を初期化
        model.view = null;
      }
    }
  }

  function renderFingerOcclusion(cylinder, model_info, texture){
    const width = window.innerWidth; // rendererのサイズ
    const height = window.innerHeight;
    // 1.指の座標を3D空間座標に変換
    //console.log("finger_pos:[", + model_info.x + "," + model_info.y + "]");

    // 4.指の検出領域(各関節点の直線の長さ)に合わせて３Dモデルの拡大縮小
    // 各関節点の直線の長さ = 93.396でringのscale:0.01
    var scaling = model_info.distance / 110;
    cylinder.scale.set(scaling, scaling, scaling);

    var finger3Dx =  (model_info.x * 2 / width) - 1.0;
    var finger3Dy = -(model_info.y * 2 / height) + 1.0;
    //console.log("finger3Dpos:[", + finger3Dx + "," + finger3Dy + "]"); 
        
    // 2.円柱を指の検出座標に移動
    // 左右のpositionが−1~1じゃない場合にパラメータ調整必要。現状はpixel3a(-0.4~0.4)に最適化
    cylinder.position.set(finger3Dx*0.5, finger3Dy, 0.02);
    //console.log("angle:" + model_info.angle);
    //console.log("distance:" + model_info.distance);

    
    //console.log("model scaling:" + model_scaling);
    // 5.指輪の位置変更に合わせてオクルージョン用の円柱も位置変更
    //パラメータ：90:0, 180:1.55→155/90 = 1.72
    //cylinder.position.set(finger3Dx, finger3Dy, 0.0);
    cylinder.rotation.set(0,0,(90-model_info.angle)*0.0172);
    //console.log(cylinder.rotation.z);
    
    
    //ToDo:描画処理順の修正
    //cylinder.position.z = model_info.z;
    //console.log("renderFingerOcclusion_z:" + cylinder.position.z);
  }
  
}