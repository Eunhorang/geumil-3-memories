// 2026년 금일초 3학년의 추억 — 사이트 주소 QR 만들기·읽기 (금일초 학생자치회 앱의 qr.swift를 그대로 가져옴)
//
// 맥에 들어 있는 CoreImage(QR 만들기)와 Vision·CIDetector(QR 읽기)만 씁니다. 따로 설치할 것이 없습니다.
//
//   swift tools/qr.swift make <주소> <내보낼 이름>   → <이름>.png(300dpi, 인쇄하면 약 10.7cm), <이름>.svg
//   swift tools/qr.swift read <그림 파일>            → 그림 속 QR을 두 가지 판독기로 읽어 주소를 보여 줍니다
//
// 오류 정정은 M(약 15%)입니다. 게시물이 조금 구겨지거나 긁혀도 읽힙니다.

import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(1)
}

// 위·왼쪽 모서리(r, c)에서 7×7 위치 찾기 무늬가 맞는지 봅니다
func isFinder(_ m: [[Bool]], _ r: Int, _ c: Int) -> Bool {
  for i in 0..<7 {
    for j in 0..<7 where m[r + i][c + j] != (max(abs(i - 3), abs(j - 3)) != 2) { return false }
  }
  return true
}

// 칸마다 검은지(true) 흰지(false)를 담은 정사각 표. 둘레 여백은 뺍니다
func modules(_ text: String) -> [[Bool]] {
  guard let f = CIFilter(name: "CIQRCodeGenerator") else { fail("CIQRCodeGenerator가 없습니다") }
  f.setValue(text.data(using: .utf8), forKey: "inputMessage")
  f.setValue("M", forKey: "inputCorrectionLevel")
  guard let img = f.outputImage, let cg = CIContext().createCGImage(img, from: img.extent) else { fail("QR을 만들지 못했습니다") }
  let w = cg.width, h = cg.height
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { fail("그림판을 만들지 못했습니다") }
  ctx.interpolationQuality = .none
  ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
  let px = ctx.data!.assumingMemoryBound(to: UInt8.self), row = ctx.bytesPerRow
  var top = h, left = w, bottom = -1, right = -1
  for y in 0..<h {
    for x in 0..<w where px[y * row + x] < 128 {
      top = min(top, y); bottom = max(bottom, y); left = min(left, x); right = max(right, x)
    }
  }
  let n = bottom - top + 1
  guard n == right - left + 1, n >= 21, (n - 17) % 4 == 0 else { fail("QR 크기가 이상합니다: \(n)") }
  var m = (0..<n).map { y in (0..<n).map { x in px[(top + y) * row + left + x] < 128 } }
  if !(isFinder(m, 0, 0) && isFinder(m, 0, n - 7) && isFinder(m, n - 7, 0)) { m.reverse() }
  guard isFinder(m, 0, 0) && isFinder(m, 0, n - 7) && isFinder(m, n - 7, 0) else { fail("위치 찾기 무늬가 맞지 않습니다") }
  return m
}

func make(_ text: String, _ base: String) {
  let m = modules(text), n = m.count, quiet = 4, size = n + quiet * 2, scale = 24
  // SVG: 줄마다 이어진 검은 칸을 한 조각으로 묶음
  var d = ""
  for y in 0..<n {
    var x = 0
    while x < n {
      guard m[y][x] else { x += 1; continue }
      var e = x
      while e < n && m[y][e] { e += 1 }
      d += "M\(x + quiet) \(y + quiet)h\(e - x)v1h-\(e - x)z"
      x = e
    }
  }
  let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 \(size) \(size)\" shape-rendering=\"crispEdges\">" +
    "<rect width=\"\(size)\" height=\"\(size)\" fill=\"#fff\"/><path fill=\"#000\" d=\"\(d)\"/></svg>\n"
  try! svg.write(toFile: base + ".svg", atomically: true, encoding: .utf8)
  // PNG: 칸 하나를 24px로, 300dpi로 적어 두면 그대로 인쇄했을 때 약 10.7cm
  let px = size * scale
  let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
  ctx.setFillColor(gray: 1, alpha: 1); ctx.fill(CGRect(x: 0, y: 0, width: px, height: px))
  ctx.setFillColor(gray: 0, alpha: 1)
  for y in 0..<n {
    for x in 0..<n where m[y][x] {
      ctx.fill(CGRect(x: (x + quiet) * scale, y: (size - 1 - (y + quiet)) * scale, width: scale, height: scale))
    }
  }
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: base + ".png") as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, ctx.makeImage()!, [kCGImagePropertyDPIWidth: 300, kCGImagePropertyDPIHeight: 300] as CFDictionary)
  guard CGImageDestinationFinalize(dest) else { fail("PNG를 쓰지 못했습니다") }
  print("버전 \((n - 17) / 4) · \(n)×\(n)칸 · 여백 포함 \(size)칸 · PNG \(px)px · 글자 \(text.utf8.count)바이트")
}

func read(_ path: String) {
  guard let ci = CIImage(contentsOf: URL(fileURLWithPath: path)) else { fail("그림을 열지 못했습니다: \(path)") }
  let det = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
  for f in det.features(in: ci) { print("CIDetector: " + ((f as? CIQRCodeFeature)?.messageString ?? "(읽지 못함)")) }
  let req = VNDetectBarcodesRequest()
  req.symbologies = [.qr]
  try? VNImageRequestHandler(ciImage: ci, options: [:]).perform([req])
  for r in req.results ?? [] { print("Vision: " + (r.payloadStringValue ?? "(읽지 못함)")) }
}

let a = CommandLine.arguments
switch a.count > 2 ? a[1] : "" {
case "make" where a.count == 4: make(a[2], a[3])
case "read": read(a[2])
default: fail("쓰는 법: swift qr.swift make <주소> <내보낼 이름> | read <그림 파일>")
}
