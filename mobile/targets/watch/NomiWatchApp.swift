import SwiftUI

@main
struct NomiWatchApp: App {
  @StateObject private var session = SessionController()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(session)
    }
  }
}
