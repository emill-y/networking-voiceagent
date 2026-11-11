import ActivityKit
import ExpoModulesCore

public class NomiLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NomiLiveActivity")

    Function("isSupported") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // One session at a time: anything left over from before is ended first.
    AsyncFunction("start") { (title: String, startedAtMs: Double, people: Int, latest: String?) async throws in
      for activity in Activity<NomiSessionAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      let attributes = NomiSessionAttributes(title: title, startedAt: Date(timeIntervalSince1970: startedAtMs / 1000))
      let state = NomiSessionAttributes.ContentState(people: people, latest: latest, listening: true)
      _ = try Activity.request(attributes: attributes, content: .init(state: state, staleDate: nil), pushType: nil)
    }

    AsyncFunction("update") { (people: Int, latest: String?, listening: Bool) async in
      let state = NomiSessionAttributes.ContentState(people: people, latest: latest, listening: listening)
      for activity in Activity<NomiSessionAttributes>.activities {
        await activity.update(.init(state: state, staleDate: nil))
      }
    }

    AsyncFunction("end") { () async in
      for activity in Activity<NomiSessionAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
