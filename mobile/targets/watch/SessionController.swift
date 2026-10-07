import AVFoundation
import Foundation
import WatchConnectivity

/// Records a networking session on the watch in 30-second chunks and uploads
/// each one to the session the iPhone started. The phone sends the session id
/// and a token that can only upload to that one session while it's recording;
/// the watch never sees the user's sign-in.
final class SessionController: NSObject, ObservableObject {
  enum Phase: Equatable {
    case waiting      // no session on the phone yet
    case ready        // a session exists; tap to record from the wrist
    case recording
    case error(String)
  }

  @Published var phase: Phase = .waiting
  @Published var title: String = ""
  @Published var elapsed: TimeInterval = 0
  @Published var uploaded = 0
  @Published var people: [String] = []
  @Published var phoneReachable = false

  private var sessionId: String?
  private var uploadToken: String?
  private var apiUrl: String?
  private var recorder: AVAudioRecorder?
  private var chunkTimer: Timer?
  private var clock: Timer?
  private var startedAt = Date()
  // Watch chunks use their own sequence numbers so they never collide with
  // chunks the phone records for the same session.
  private var seq = 180
  private let chunkSeconds: TimeInterval = 30

  override init() {
    super.init()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  // MARK: Controls

  /// Ask the phone to start a session (the Nomi app must be open there).
  func askPhoneToStart() {
    guard WCSession.default.isReachable else {
      phase = .error("Open Nomi on your iPhone and start a session.")
      return
    }
    WCSession.default.sendMessage(["action": "startSession"], replyHandler: nil) { [weak self] _ in
      DispatchQueue.main.async { self?.phase = .error("Couldn't reach your iPhone.") }
    }
  }

  func startRecording() {
    guard sessionId != nil else { return }
    let audio = AVAudioSession.sharedInstance()
    audio.requestRecordPermission { [weak self] granted in
      DispatchQueue.main.async {
        guard let self else { return }
        guard granted else {
          self.phase = .error("Allow the microphone in Settings › Privacy › Microphone.")
          return
        }
        do {
          try audio.setCategory(.record, mode: .spokenAudio)
          try audio.setActive(true)
        } catch {
          self.phase = .error("The microphone isn't available right now.")
          return
        }
        self.startedAt = Date()
        self.elapsed = 0
        self.phase = .recording
        self.recordChunk()
        self.clock = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
          guard let self else { return }
          self.elapsed = Date().timeIntervalSince(self.startedAt)
        }
      }
    }
  }

  func stopRecording() {
    chunkTimer?.invalidate()
    clock?.invalidate()
    finishChunk()
    try? AVAudioSession.sharedInstance().setActive(false)
    phase = sessionId == nil ? .waiting : .ready
  }

  // MARK: Chunks

  private func recordChunk() {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("nomi-\(seq).m4a")
    let settings: [String: Any] = [
      AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
      AVSampleRateKey: 16_000,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
    ]
    do {
      recorder = try AVAudioRecorder(url: url, settings: settings)
      recorder?.record()
    } catch {
      phase = .error("Couldn't start recording.")
      return
    }
    chunkTimer = Timer.scheduledTimer(withTimeInterval: chunkSeconds, repeats: false) { [weak self] _ in
      guard let self, self.phase == .recording else { return }
      self.finishChunk()
      self.recordChunk()
    }
  }

  private func finishChunk() {
    guard let recorder, recorder.isRecording else { return }
    recorder.stop()
    let file = recorder.url
    let chunkSeq = seq
    seq += 1
    self.recorder = nil
    upload(file: file, seq: chunkSeq, attempt: 0)
  }

  private func upload(file: URL, seq: Int, attempt: Int) {
    guard let sessionId, let uploadToken, let apiUrl,
          let endpoint = URL(string: "\(apiUrl)/sessions/\(sessionId)/chunks"),
          let audio = try? Data(contentsOf: file) else { return }
    let boundary = "nomi-\(UUID().uuidString)"
    var body = Data()
    func field(_ name: String, _ value: String) {
      body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
    }
    field("seq", String(seq))
    body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"chunk-\(seq).m4a\"\r\nContent-Type: audio/mp4\r\n\r\n".data(using: .utf8)!)
    body.append(audio)
    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

    var request = URLRequest(url: endpoint, timeoutInterval: 90)
    request.httpMethod = "POST"
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    request.setValue(uploadToken, forHTTPHeaderField: "X-Session-Token")
    request.httpBody = body

    URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      DispatchQueue.main.async {
        guard let self else { return }
        if status == 200 {
          try? FileManager.default.removeItem(at: file)
          self.uploaded += 1
          if let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
             let found = json["people"] as? [[String: Any]] {
            self.people = found.compactMap { $0["name"] as? String }
          }
        } else if (status == 0 || status >= 500 || status == 429) && attempt < 3 {
          DispatchQueue.main.asyncAfter(deadline: .now() + Double(attempt + 1) * 2) {
            self.upload(file: file, seq: seq, attempt: attempt + 1)
          }
        } else {
          try? FileManager.default.removeItem(at: file)
          if status == 404 || status == 409 {
            // The session ended on the phone.
            self.stopRecording()
            self.clearSession()
          }
        }
      }
    }.resume()
  }

  // MARK: Session from the phone

  private func apply(_ context: [String: Any]) {
    if let id = context["sessionId"] as? String, let token = context["uploadToken"] as? String,
       let api = context["apiUrl"] as? String, !api.isEmpty {
      if id != sessionId {
        seq = 180
        uploaded = 0
        people = []
      }
      sessionId = id
      uploadToken = token
      apiUrl = api
      title = (context["title"] as? String) ?? ""
      if phase != .recording { phase = .ready }
    } else {
      if phase == .recording { stopRecording() }
      clearSession()
    }
  }

  private func clearSession() {
    sessionId = nil
    uploadToken = nil
    title = ""
    phase = .waiting
  }
}

extension SessionController: WCSessionDelegate {
  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    let context = session.receivedApplicationContext
    DispatchQueue.main.async {
      self.phoneReachable = session.isReachable
      self.apply(context)
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
    DispatchQueue.main.async { self.apply(context) }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    DispatchQueue.main.async { self.phoneReachable = session.isReachable }
  }
}
