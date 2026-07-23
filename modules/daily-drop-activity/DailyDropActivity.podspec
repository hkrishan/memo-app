Pod::Spec.new do |s|
  s.name           = 'DailyDropActivity'
  s.version        = '1.0.0'
  s.summary        = 'Live Activity control for the Memo daily drop'
  s.description    = 'Starts/ends the daily-drop countdown Live Activity from JS.'
  s.author         = ''
  s.homepage       = 'https://github.com/hugokrishan/memo'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/**/*.{h,m,swift}'
end
