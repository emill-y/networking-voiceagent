import ActivityKit
import Foundation

// Keep identical to targets/widget/NomiSessionAttributes.swift: iOS matches the
// app's Live Activity to the widget's view by this type's name and shape.
struct NomiSessionAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var people: Int
    var latest: String?
    var listening: Bool
  }

  var title: String
  var startedAt: Date
}
