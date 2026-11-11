import ActivityKit
import SwiftUI
import WidgetKit

// Opening these links lands on the session screen (app/session.tsx).
private let startURL = URL(string: "nomi://session?start=1")!
private let openURL = URL(string: "nomi://session")!
private let endURL = URL(string: "nomi://session?end=1")!

@main
struct NomiWidgets: WidgetBundle {
  var body: some Widget {
    StartSessionWidget()
    SessionLiveActivity()
  }
}

// MARK: - "Start session" widget (home screen and lock screen)

struct StartEntry: TimelineEntry {
  let date: Date
}

struct StartProvider: TimelineProvider {
  func placeholder(in context: Context) -> StartEntry { StartEntry(date: .now) }
  func getSnapshot(in context: Context, completion: @escaping (StartEntry) -> Void) { completion(StartEntry(date: .now)) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<StartEntry>) -> Void) {
    completion(Timeline(entries: [StartEntry(date: .now)], policy: .never))
  }
}

struct StartSessionView: View {
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "mic.fill").font(.system(size: 20, weight: .semibold))
      }
      .widgetURL(startURL)
    case .accessoryRectangular:
      HStack(spacing: 6) {
        Image(systemName: "mic.fill")
        VStack(alignment: .leading, spacing: 0) {
          Text("Nomi").font(.headline)
          Text("Start a session").font(.caption)
        }
      }
      .widgetURL(startURL)
    default:
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 6) {
          Circle().fill(Color("orb")).frame(width: 10, height: 10)
          Text("Nomi").font(.system(.subheadline, design: .serif)).foregroundStyle(Color("ink"))
        }
        Spacer()
        Text(family == .systemMedium ? "Walking into an event?" : "New session")
          .font(.system(.title3, design: .serif))
          .foregroundStyle(Color("ink"))
        if family == .systemMedium {
          Text("One tap and Nomi remembers everyone you meet.")
            .font(.caption)
            .foregroundStyle(Color("soft"))
            .padding(.top, 2)
        }
        Spacer(minLength: 8)
        HStack(spacing: 6) {
          Image(systemName: "mic.fill").font(.caption.weight(.semibold))
          Text("Start session").font(.caption.weight(.semibold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: family == .systemMedium ? nil : .infinity)
        .background(Capsule().fill(Color("ink")))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .widgetURL(startURL)
    }
  }
}

struct StartSessionWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NomiStartSession", provider: StartProvider()) { _ in
      if #available(iOS 17.0, *) {
        StartSessionView().containerBackground(Color("paper"), for: .widget)
      } else {
        StartSessionView().padding().background(Color("paper"))
      }
    }
    .configurationDisplayName("Start a session")
    .description("One tap to start recording at an event.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
  }
}

// MARK: - The recording session (lock screen and Dynamic Island)

private func peopleText(_ n: Int) -> String {
  n == 0 ? "Listening for introductions" : n == 1 ? "1 person so far" : "\(n) people so far"
}

struct SessionLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: NomiSessionAttributes.self) { context in
      // Lock screen and notification banner
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) {
            Circle().fill(Color("live")).frame(width: 8, height: 8)
            Text(context.state.listening ? "Recording" : "Paused")
              .font(.caption.weight(.semibold))
              .foregroundStyle(Color("live"))
            Text("· \(context.attributes.title)").font(.caption).foregroundStyle(Color("soft")).lineLimit(1)
          }
          Text(context.attributes.startedAt, style: .timer)
            .font(.system(size: 34, weight: .medium, design: .serif))
            .monospacedDigit()
            .foregroundStyle(Color("ink"))
          Text(context.state.latest.map { "\(peopleText(context.state.people)) · latest: \($0)" } ?? peopleText(context.state.people))
            .font(.caption)
            .foregroundStyle(Color("soft"))
            .lineLimit(1)
        }
        Spacer()
        Link(destination: endURL) {
          Text("End")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Capsule().fill(Color("ink")))
        }
      }
      .padding(16)
      .activityBackgroundTint(Color("paper"))
      .activitySystemActionForegroundColor(Color("ink"))
      .widgetURL(openURL)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            Circle().fill(Color("live")).frame(width: 8, height: 8)
            Text("Recording").font(.caption.weight(.semibold)).foregroundStyle(Color("live"))
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.attributes.startedAt, style: .timer)
            .font(.caption.monospacedDigit())
            .multilineTextAlignment(.trailing)
            .frame(width: 64)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            VStack(alignment: .leading, spacing: 2) {
              Text(context.attributes.title).font(.headline).lineLimit(1)
              Text(peopleText(context.state.people)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Link(destination: endURL) {
              Text("End").font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14).padding(.vertical, 6)
                .background(Capsule().fill(.white.opacity(0.18)))
            }
          }
        }
      } compactLeading: {
        HStack(spacing: 4) {
          Circle().fill(Color("live")).frame(width: 7, height: 7)
          Image(systemName: "mic.fill").font(.caption2)
        }
      } compactTrailing: {
        Text("\(context.state.people)")
          .font(.caption.weight(.semibold).monospacedDigit())
          .foregroundStyle(Color("live"))
      } minimal: {
        Circle().fill(Color("live")).frame(width: 8, height: 8)
      }
      .widgetURL(openURL)
      .keylineTint(Color("live"))
    }
  }
}
