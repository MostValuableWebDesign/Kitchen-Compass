Pod::Spec.new do |s|
  s.name           = 'SpaceScan'
  s.version        = '1.0.0'
  s.summary        = 'LiDAR storage-space capture for Kitchen Compass'
  s.description    = 'ARKit mesh capture and local SceneKit preview for pantry, refrigerator, and freezer spaces.'
  s.author         = 'Kitchen Compass'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
