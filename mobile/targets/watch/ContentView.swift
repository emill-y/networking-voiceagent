import SwiftUI

struct ContentView: View {
  @EnvironmentObject var session: SessionController
  @State private var pulse = false

  private let accent = Color(red: 0.94, green: 0.54, blue: 0.29)

  var body: some View {
    ScrollView {
      VStack(spacing: 10) {
        planet
        switch session.phase {
        case .waiting:
          Text("No session yet").font(.headline)
          Text("Start one on your iPhone, or here.").font(.footnote).foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
          Button("Start session") { session.askPhoneToStart() }.tint(accent)
        case .ready:
          Text(session.title.isEmpty ? "Session ready" : session.title).font(.headline).lineLimit(2)
          Button {
            session.startRecording()
          } label: {
            Label("Record", systemImage: "mic.fill")
          }.tint(accent)
        case .recording:
          Text(timeString(session.elapsed)).font(.system(.title3, design: .rounded).monospacedDigit())
          Text(session.people.isEmpty ? "Listening…" : "\(session.people.count) found")
            .font(.footnote).foregroundStyle(.secondary)
          ForEach(session.people.prefix(4), id: \.self) { name in
            Text(name).font(.caption)
          }
          Button(role: .destructive) {
            session.stopRecording()
          } label: {
            Label("Stop", systemImage: "stop.fill")
          }
        case .error(let message):
          Text(message).font(.footnote).multilineTextAlignment(.center)
          Button("OK") { session.phase = .waiting }
        }
      }
      .padding(.horizontal, 4)
    }
  }

  private var planet: some View {
    ZStack {
      Circle().stroke(Color.white.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [2, 4]))
        .frame(width: 64, height: 64)
      Circle()
        .fill(RadialGradient(colors: [Color(red: 1, green: 0.88, blue: 0.77), accent, Color(red: 0.55, green: 0.2, blue: 0.06)],
                             center: UnitPoint(x: 0.36, y: 0.3), startRadius: 1, endRadius: 30))
        .frame(width: 38, height: 38)
        .scaleEffect(session.phase == .recording && pulse ? 1.08 : 1)
        .shadow(color: accent.opacity(0.6), radius: session.phase == .recording ? 10 : 4)
    }
    .onAppear {
      withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) { pulse = true }
    }
  }

  private func timeString(_ t: TimeInterval) -> String {
    let s = Int(t)
    return String(format: "%d:%02d", s / 60, s % 60)
  }
}
