(function () {

	//webgl init
	var webglEl = document.getElementById('webgl');
	if (!Detector.webgl) {
		Detector.addGetWebGLMessage(webglEl);
		return;
	}

	// itt megadott helyek lat/long alapjan bejelolhetoek a gombon
	var objectData = [
		{
			name: 'Schönherz',
			lat: 47.472893,
			lon: 19.053218
		},
		{
			name: 'London',
			lat: 51.507351,
			lon: -0.127758
		},
		{
			name: 'Rome',
			lat: 41.902783,
			lon: 12.496366
		},
		{
			name: 'Canari Islands',
			lat: 28.291564,
			lon: -16.629130
		},
		{
			name: 'Dubai',
			lat: 25.204849,
			lon: 55.270783
		},
		{
			name: 'Beijing',
			lat: 39.904211,
			lon: 116.407395
		}
	];


	var Shaders = {
		'earth' : {
			uniforms: {
				'texture': { type: 't', value: null }
			},
			vertexShader: [
				'varying vec3 vNormal;',
				'varying vec2 vUv;',
				'void main() {',
				'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
				'vNormal = normalize( normalMatrix * normal );',
				'vUv = uv;',
				'}'
			].join('\n'),
			fragmentShader: [
				'uniform sampler2D texture;',
				'varying vec3 vNormal;',
				'varying vec2 vUv;',
				'void main() {',
				'vec3 diffuse = texture2D( texture, vUv ).xyz;',
				'float intensity = 1.1 - dot( vNormal, vec3( 0, -0.5, 1.2 ) );',
				'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
				'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
				'}'
			].join('\n')
		},
		'atmosphere' : {
			uniforms: {},
			vertexShader: [
				'varying vec3 vNormal;',
				'void main() {',
				'vNormal = normalize( normalMatrix * normal );',
				'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
				'}'
			].join('\n'),
			fragmentShader: [
				'varying vec3 vNormal;',
				'void main() {',
				'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
				'gl_FragColor = vec4( 1.0, 1.0, 1.0, 0.5 ) * intensity;',
				'}'
			].join('\n')
		}
	};

	var objects = [];
	var raycaster,
		mouse;

	// World coordinates based transformations
	var rotWorldMatrix;

	// Navigation
	var renderer,
		camera,
		scene,
		controls;

	// kepernyo szelessege es magassaga
	var width  = window.innerWidth,
		height = window.innerHeight;

	// fold parameterei
	var earth,
		clouds,
		shader,
		shader2,
		radius   = 0.5,
		segments = 36;

	// a lenyeg
	function init() {
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);

		camera.position.x = -2;
		camera.position.y = 0.25;
		camera.position.z = 0;

		renderer = new THREE.WebGLRenderer();
		renderer.setSize(width, height);
		raycaster = new THREE.Raycaster();
		mouse = new THREE.Vector2();
		controls = new THREE.OrbitControls( camera, renderer.domElement );

		scene.add(new THREE.AmbientLight(0x666666));

		//fold felszinere rahuzzuk a texturat, a rendernek mar ezt a shadert adjuk oda
		shader = Shaders['earth'];
		var uniforms = THREE.UniformsUtils.clone(shader.uniforms);
		uniforms['texture'].value = THREE.ImageUtils.loadTexture('images/2_no_clouds_4k.jpg');

		var earthMaterial = new THREE.ShaderMaterial({

			uniforms: uniforms,
			vertexShader: shader.vertexShader,
			fragmentShader: shader.fragmentShader

		});

		var light = new THREE.DirectionalLight(0xffffff, 1);
		light.position.set(5,3,5);
		scene.add(light);
		earth = createSphere(radius, segments, earthMaterial);
		earth.rotation.y = -1.372;
		scene.add(earth);

		shader2 = Shaders['atmosphere'];

		var uniforms2 = THREE.UniformsUtils.clone(shader.uniforms);
		var material2 = new THREE.ShaderMaterial({

			uniforms: uniforms2,
			vertexShader: shader2.vertexShader,
			fragmentShader: shader2.fragmentShader,
			side: THREE.BackSide,
			blending: THREE.AdditiveBlending,
			transparent: true

		});

		var atmosphere = createSphere(radius, segments, material2);
		atmosphere.scale.set( 1.1, 1.1, 1.1 );
		scene.add(atmosphere);

		clouds = createClouds(radius, segments);
		scene.add(clouds);

		var stars = createStars(90, 64);
		scene.add(stars);
		webglEl.appendChild(renderer.domElement);

		render();
	}

	function rotateTo(pos) {
		TweenLite.to(camera.position, 1, {
			x: pos.x,
			y: pos.y,
			z: pos.z,
			ease: Expo.easeOut
		});
	}


	//ha be aakrnank jelolni az objectDataban levo helyeket, akkor ezzel tudunk szamolni
	function getLatitude(vec) {
		var x = vec.x;
		var y = vec.y;
		var z = vec.z;
		var r = Math.sqrt(x * x + y * y + z * z);

		return Math.acos( z / r );
	}

	function getLongitude(vec) {
		var x = vec.x;
		var y = vec.y;

		return Math.atan( x / y );
	}

	function getDescartesCoords(r, lon, lat) {
		var x,
			y,
			z;

		y = r * Math.cos(lat);
		z = r * Math.sqrt((1 - Math.cos(lat) * Math.cos(lat)) / (Math.tan(lon) * Math.tan(lon) + 1));
		x = Math.tan(lon) * z;

		return new THREE.Vector3(x, y, z);
	}

	function addPoint(r, latd, lond, clr) {
		var lat, lon;
		var x, y, z;

		lat = DegToRad(90 - latd);
		lon = DegToRad(lond);

		y = r * Math.cos(lat);
		z = r * Math.sqrt((1 - Math.cos(lat) * Math.cos(lat)) / (Math.tan(lon) * Math.tan(lon) + 1));
		x = Math.tan(lon) * z;

		var geometry = new THREE.BoxGeometry( 0.005, 0.005, 0.05);
		var material = new THREE.MeshBasicMaterial( {color: clr} );
		var cube = new THREE.Mesh( geometry, material );

		if (lond < -90 || lond > 90) {
			rotateAroundWorldAxis(cube, new THREE.Vector3(1,0,0), -DegToRad(latd));
			rotateAroundWorldAxis(cube, new THREE.Vector3(0,1,0), lon);
			cube.position.set(-x, y, -z);
		} else {
			rotateAroundWorldAxis(cube, new THREE.Vector3(1,0,0), -DegToRad(latd));
			rotateAroundWorldAxis(cube, new THREE.Vector3(0,1,0), lon);

			cube.position.set(x, y, z);
		}

		objects.push(cube);
		return false;
	}

	// fok es radian valtas
	function DegToRad(deg) {
		return (deg / 180) * Math.PI;
	}

	// vilag tengelye koruli forgatas
	function rotateAroundWorldAxis(object, axis, radians) {
		rotWorldMatrix = new THREE.Matrix4();
		rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
		rotWorldMatrix.multiply(object.matrix);        // pre-multiply
		object.matrix = rotWorldMatrix;
		object.rotation.setFromRotationMatrix(object.matrix);
	}

	// eventek kezelesehez
	function onDocumentTouchStart( event ) {

		event.preventDefault();

		event.clientX = event.touches[0].clientX;
		event.clientY = event.touches[0].clientY;
		onDocumentMouseDown( event );

	}

	function onDocumentMouseDown( event ) {

		event.preventDefault();

		mouse.x = ( event.clientX / renderer.domElement.clientWidth ) * 2 - 1;
		mouse.y = -( event.clientY / renderer.domElement.clientHeight ) * 2 + 1;

		raycaster.setFromCamera( mouse, camera );

		var intersects = raycaster.intersectObjects( objects );

		if ( intersects.length > 0 ) {
			var detectedObj = intersects[0].object;

			var detectedVec = new THREE.Vector3(detectedObj.position.x, detectedObj.position.y, detectedObj.position.z).normalize();
			var zoom = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z).length();
			var newCameraPosVec = detectedVec.multiplyScalar(zoom);

			rotateTo(newCameraPosVec);

			//camera.position.set(newCameraPosVec.x, newCameraPosVec.y, newCameraPosVec.z);
		}
	}


	function setCamera( pos, step, i ) {
		//debugger;
		if( i == step - 1 ) {
			return false;
		}

		i++;
		camera.position.set(pos[i].x, pos[i].y, pos[i].z);
		setTimeout(setCamera( pos, step, i ), 50);
	}

	// Render
	function render() {
		controls.update();
		earth.rotation.y += 0.0005;
		clouds.rotation.y += 0.002;
		requestAnimationFrame(render);
		renderer.render(scene, camera);
	}

	// Creates sphere geometry
	function createSphere(radius, segments, shaderMat) {
		var sphere = new THREE.SphereGeometry(radius, segments, segments);
		return new THREE.Mesh( sphere, shaderMat
			// new THREE.MeshPhongMaterial({
			// 	opacity: 0.3,
			// 	transparent: true,
			// 	/*map:         THREE.ImageUtils.loadTexture('images/2_no_clouds_4k_black2-01.jpg'),*/
			// 	/*bumpMap:     THREE.ImageUtils.loadTexture('images/elev_bump_4k.jpg'),
			// 	bumpScale:   0.005,
			// 	specularMap: THREE.ImageUtils.loadTexture('images/water_4k.png'),
			// 	specular:    new THREE.Color('grey')*/
			// })
		);
	}

	function createClouds(radius, segments) {
		return new THREE.Mesh(
			new THREE.SphereGeometry(radius + 0.003, segments, segments),
			new THREE.MeshPhongMaterial({
				map:         THREE.ImageUtils.loadTexture('images/fair_clouds_4k.png'),
				transparent: true
			})
		);
	}

	function createStars(radius, segments) {
		return new THREE.Mesh(
			new THREE.SphereGeometry(radius, segments, segments),
			new THREE.MeshBasicMaterial({
				map:  THREE.ImageUtils.loadTexture('images/galaxy_starfield.png'),
				side: THREE.BackSide
			})
		);
	}

	init();

	document.addEventListener( 'mousedown', onDocumentMouseDown, false );
	document.addEventListener( 'touchstart', onDocumentTouchStart, false );

}());