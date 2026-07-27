Pod::Spec.new do |s|
  s.name           = 'DualCamera'
  s.version        = '1.0.0'
  s.summary        = 'Simultaneous front + back camera capture'
  s.description    = 'AVCaptureMultiCamSession-backed dual camera preview, photo and video capture.'
  s.author         = ''
  s.homepage       = 'https://github.com/hugokrishan/memo'
  s.license        = 'MIT'
  # AVCaptureMultiCamSession needs iOS 13; the app targets 16.0 anyway.
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  # ImageIO supplies the JPEG-quality key used when encoding stills.
  s.frameworks     = 'AVFoundation', 'CoreImage', 'CoreMedia', 'CoreVideo', 'ImageIO', 'Metal', 'MetalKit'
  s.source_files = 'ios/**/*.{h,m,swift}'
end
