Pod::Spec.new do |s|
  s.name           = 'NomiLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Live Activity for a recording Nomi session'
  s.description    = 'Starts, updates and ends the lock screen / Dynamic Island view of a Nomi session.'
  s.license        = 'MIT'
  s.author         = 'Nomi'
  s.homepage       = 'https://nomi-connect.vercel.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.swift'
end
