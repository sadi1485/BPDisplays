// this class sets up the BreakPoints displays in JS
// using P5 functionality for the camera feed
class BPDisplays {
  // If you expect more than one camera, pass in the index that you want.
  constructor(
    captureReadyCallback,
    videoWidth,
    videoHeight,
    selectedCameraIndex = 0,
    mirror = false,
    rotation = 0
  ) {
    this.captureReadyCallback = captureReadyCallback;
    this.videoWidth = videoWidth;
    this.videoHeight = videoHeight;
    this.selectedCameraIndex = selectedCameraIndex;
    this.captureReady = false; // flips to true when the video capture is set up
    this.capture = null;
    this.mirroring = mirror;
    this.rotation = rotation;

    this.devices = []; // list to hold the discovered video devices

    // callbacks need special handling to bind to the instance methods
    this.gotDevices = this.gotDevices.bind(this);
    this.initCaptureP5 = this.initCaptureP5.bind(this);
    this.configCapture = this.configCapture.bind(this);

    // find the connected cameras; use a callback when done
    navigator.mediaDevices.enumerateDevices().then(this.gotDevices);
  }

  // function that gets "called back" (invoked) when devices have been discovered
  // will be passed an array of device info
  gotDevices(deviceInfos) {
    console.log("gotDevices");
    console.log(this);

    // iterate over the discovered devices to populate a dictionary of label, id info
    for (let i = 0; i < deviceInfos.length; i++) {
      const deviceInfo = deviceInfos[i];
      if (deviceInfo.kind == "videoinput") {
        this.devices.push({
          label: deviceInfo.label,
          id: deviceInfo.deviceId,
        });
      }
    }

    // print out the discovered devices
    console.log(this.devices);

    // check if we have camera permissions
    navigator.permissions.query({ name: "camera" }).then((permissionStatus) => {
      if (permissionStatus.state === "granted") {
        // Camera access is granted
        console.log("camera access granted!");

        // start the video capture
        this.initCaptureP5();
      } else {
        // Camera access is not granted; request permission as needed
        console.log("camera access not granted");

        navigator.mediaDevices
          .getUserMedia({ video: true })
          .then(function (stream) {
            // Handle the camera stream now that we succeeded
            // use the discovered camera information to initialize the capture video stream
            this.initCaptureP5();
          })
          .catch(function (error) {
            // Handle errors, such as permission denied
            console.log(error);
          });
      }
    });
  }

  // assuming video devices are initialized, so create the p5 camera element
  // uses the selectedCameraIndex property
  initCaptureP5() {
    var constraints = {
      audio: false,
      video: {
        width: this.videoWidth,
        height: this.videoHeight,
        deviceId: {
          exact: this.devices[this.selectedCameraIndex].id, // chooses the webcam to use for input
        },
      },
    };

    // p5 offers createCapture function, creates an HTML element that shows video stream
    this.capture = createCapture(constraints, this.configCapture);
  }

  // update the selected camera index, indicate if we should mirror
  selectCameraIndex(indx, mirror) {
    if (indx != this.selectedCameraIndex) {
      // update the index
      this.selectedCameraIndex = indx;

      this.mirroring = mirror;

      // if we already had the capture
      if (this.capture != null)
        // reinitialize it
        this.initCaptureP5();
    }
  }

  // once p5 creates a capture, this will be called back
  // we do our own additional configuration, then call back the custom callback
  configCapture() {
    console.log("P5 capture ready!");
    this.captureReady = true;
    this.capture.elt.setAttribute("playsinline", "");
    this.capture.size(this.videoWidth, this.videoHeight);
    this.capture.elt.id = "webcam";
    this.capture.position(0, 0); //move the capture to the top left
    this.capture.style("opacity", 0.25);

    let transformProp = "";
    if (this.mirroring)
      // scale it by -1 in the x-axis to flip the source video image
      transformProp += "scale(-1,1)";

    if (this.rotation != 0)
      // rotate the source video image
      transformProp += "rotate(" + this.rotation + "deg)";

    this.capture.elt.style = "transform:" + transformProp;

    console.log("about to invoke callback");
    console.log(this.captureReadyCallback);
    this.captureReadyCallback(); // invoke their custom callback
  }

  isCaptureReady() {
    return this.captureReady;
  }
}

class BPDisplayFaces extends BPDisplays {
  constructor(
    captureReadyCallback,
    videoWidth,
    videoHeight,
    selectedCameraIndex = 0,
    mirror = false,
    rotation = 0,
    maxNumFaces = 2
  ) {
    super(
      captureReadyCallback,
      videoWidth,
      videoHeight,
      selectedCameraIndex,
      mirror,
      rotation
    );

    this.facemeshModel = null; // Store the facemesh model
    this.faceResults = [];
    this.maxNumFaces = maxNumFaces;

    // Bind methods to class instance
    this.onResults = this.onResults.bind(this);

    // Load facemesh asynchronously
    this.loadFacemeshModel();
  }

  async loadFacemeshModel() {
    try {
      // Load the MediaPipe FaceMesh model
      this.facemesh = new FaceMesh({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        },
      });

      // Configure the facemesh options
      this.facemesh.setOptions({
        maxNumFaces: this.maxNumFaces,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      // Set the callback to handle results
      this.facemesh.onResults(this.onResults);
      console.log("FaceMesh model loaded successfully");
    } catch (error) {
      console.error("Error loading FaceMesh model:", error);
    }
  }

  // Override the configCapture method to include face mesh processing
  configCapture() {
    super.configCapture(); // Call the parent class's configCapture

    // Create a hidden video element for FaceMesh to use
    const videoElement = createElement("video");
    videoElement.hide();

    // Set up the camera using MediaPipe's Camera utility
    const camera = new Camera(videoElement.elt, {
      onFrame: async () => {
        if (this.captureReady) {
          // Send the captured image to the FaceMesh model
          await this.facemesh.send({ image: this.capture.elt });
        }
      },
      width: this.videoWidth,
      height: this.videoHeight,
    });
    camera.start();
  }

  // This function is called whenever FaceMesh produces results
  onResults(results) {
    // Handle mirroring and rotation of the detected face landmarks
    if (
      (this.mirroring || this.rotation !== 0) &&
      results &&
      results.multiFaceLandmarks
    ) {
      let originalX, rotRadians;

      for (const landmarks of results.multiFaceLandmarks) {
        for (let i = 0; i < landmarks.length; i++) {
          if (this.mirroring) {
            // Flip the x-coordinate for mirroring
            landmarks[i].x = 1 - landmarks[i].x;
          }
          if (this.rotation !== 0) {
            // Apply rotation to the landmarks
            originalX = landmarks[i].x;
            rotRadians = (-this.rotation * Math.PI) / 180;
            landmarks[i].x =
              (landmarks[i].x - 0.5) * Math.cos(rotRadians) -
              landmarks[i].y * Math.sin(rotRadians) +
              0.5;
            landmarks[i].y =
              (landmarks[i].y - 0.5) * Math.cos(rotRadians) +
              originalX * Math.sin(rotRadians) +
              0.5;
          }
        }
      }
    }

    // Store the face detection results
    this.faceResults = results;
    // console.log("Face detection results:", this.faceResults);
  }
}


/***************************************** HAND DETECTION **********************************/
// this class depends on the MediaPipe Hands JS library to detect hands
class BPDisplaysHands extends BPDisplays {
  constructor(
    captureReadyCallback,
    videoWidth,
    videoHeight,
    selectedCameraIndex = 0,
    mirror = false,
    rotation = 0,
    maxNumHands = 2
  ) {
    super(
      captureReadyCallback,
      videoWidth,
      videoHeight,
      selectedCameraIndex,
      mirror,
      rotation
    );

    this.handResults = [];
    this.maxNumHands = maxNumHands;
    // callbacks need special handling to bind to the instance methods
    this.onResults = this.onResults.bind(this);
  }

  // called when the p5 capture is ready
  // override the superclass to include setting up HandsFree
  configCapture() {
    super.configCapture();

    // Creating a hand detector, which includes telling it where
    // to find the mediapipe data for it
    const hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    // Setting up the hands detector, these are defaults I think
    hands.setOptions({
      maxNumHands: this.maxNumHands,
      modelComplexity: 0,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    // Telling it the function to call when it (eventually) gets results
    hands.onResults(this.onResults);

    var p5VideoElement = createElement("video");
    p5VideoElement.hide();

    const camera = new Camera(p5VideoElement.elt, {
      onFrame: async () => {
        await hands.send({
          image: this.capture.elt,
        });
      },
      width: this.videoWidth,
      height: this.videoHeight,
    });
    camera.start();
  }

  /**
  Stores the most recent face detection results in a global variable
  so it's easy to get access to
  **/
  onResults(results) {
    // if we're mirroring or rotating, need to flip/rotate it all
    if (
      (this.mirroring || this.rotation != 0) &&
      results &&
      results.multiHandLandmarks
    ) {
      let originalX, rotRadians;
      // go through every landmark for this hand
      for (const landmarks of results.multiHandLandmarks)
        for (let i = 0; i < landmarks.length; i++) {
          if (this.mirroring)
            // flip -- coordinates are between 0 and 1
            landmarks[i].x = 1 - landmarks[i].x;
          if (this.rotation != 0) {
            originalX = landmarks[i].x;
            rotRadians = (-this.rotation * PI) / 180;
            landmarks[i].x =
              (landmarks[i].x - 0.5) * cos(rotRadians) -
              landmarks[i].y * sin(rotRadians) +
              0.5;
            landmarks[i].y =
              (landmarks[i].y - 0.5) * cos(rotRadians) +
              originalX * sin(rotRadians) +
              0.5;
          }
        }
    }
    // update the instance property
    this.handResults = results;
  }
}
