import Foundation
import Vision
import CoreImage
import CoreImage.CIFilterBuiltins
import AppKit
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: void-vision-cutout <input_path> <output_png_path>\n", stderr)
    exit(1)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]
let inputURL = URL(fileURLWithPath: inputPath)
let outputURL = URL(fileURLWithPath: outputPath)

guard let ciImage = CIImage(contentsOf: inputURL, options: [.applyOrientationProperty: true]) else {
    fputs("Failed to load input image\n", stderr)
    exit(2)
}

let context = CIContext(options: [.useSoftwareRenderer: false, .highQualityDownsample: true])
let extent = ciImage.extent

func saveCGImageAsPNG(_ cgImage: CGImage, to url: URL) -> Bool {
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        return false
    }
    CGImageDestinationAddImage(dest, cgImage, nil)
    return CGImageDestinationFinalize(dest)
}

func computeMaskStats(_ maskCI: CIImage) -> (opaqueRatio: Double, minX: Int, maxX: Int, minY: Int, maxY: Int)? {
    guard let cg = context.createCGImage(maskCI.cropped(to: extent), from: extent),
          let provider = cg.dataProvider,
          let data = provider.data,
          let ptr = CFDataGetBytePtr(data) else {
        return nil
    }
    let w = cg.width
    let h = cg.height
    guard w > 16, h > 16 else { return nil }
    let bpp = max(1, cg.bitsPerPixel / 8)
    let bpr = cg.bytesPerRow

    var opaque = 0
    var minX = w
    var maxX = 0
    var minY = h
    var maxY = 0

    for y in 0..<h {
        let row = y * bpr
        for x in 0..<w {
            let v = ptr[row + x * bpp]
            if v > 36 {
                opaque += 1
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
            }
        }
    }

    let ratio = Double(opaque) / Double(w * h)
    return (ratio, minX, maxX, minY, maxY)
}

// Applies soft edge feathering where a segmented person's shoulders touch the left/right photo boundary,
// and crops excess horizontal/top transparency while keeping bottom flush.
func finalizeCutout(from maskedCI: CIImage) -> CGImage? {
    guard let fullCG = context.createCGImage(maskedCI.cropped(to: extent), from: extent) else {
        return nil
    }
    let width = fullCG.width
    let height = fullCG.height
    guard width > 24, height > 24 else { return nil }

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bytesPerPixel = 4
    let bytesPerRow = width * bytesPerPixel
    var pixels = [UInt8](repeating: 0, count: height * bytesPerRow)

    guard let bmpCtx = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
    ) else {
        return fullCG
    }

    bmpCtx.draw(fullCG, in: CGRect(x: 0, y: 0, width: width, height: height))

    // Un-premultiply RGB where needed or attenuate premultiplied RGBA together for border-touching rows
    let fadeXSpan = max(8, Int(Double(width) * 0.11))
    let fadeTopSpan = max(6, Int(Double(height) * 0.06))

    for y in 0..<height {
        let rowStart = y * bytesPerRow
        let leftEdgeAlpha = pixels[rowStart + 3]
        let rightEdgeAlpha = pixels[rowStart + (width - 1) * 4 + 3]

        if leftEdgeAlpha > 16 {
            for x in 0..<min(width, fadeXSpan) {
                let t = Double(x) / Double(fadeXSpan)
                let smooth = 0.5 - 0.5 * cos(Double.pi * t)
                let idx = rowStart + x * 4
                pixels[idx] = UInt8(clamping: Int(Double(pixels[idx]) * smooth))
                pixels[idx + 1] = UInt8(clamping: Int(Double(pixels[idx + 1]) * smooth))
                pixels[idx + 2] = UInt8(clamping: Int(Double(pixels[idx + 2]) * smooth))
                pixels[idx + 3] = UInt8(clamping: Int(Double(pixels[idx + 3]) * smooth))
            }
        }

        if rightEdgeAlpha > 16 {
            for i in 0..<min(width, fadeXSpan) {
                let x = width - 1 - i
                let t = Double(i) / Double(fadeXSpan)
                let smooth = 0.5 - 0.5 * cos(Double.pi * t)
                let idx = rowStart + x * 4
                pixels[idx] = UInt8(clamping: Int(Double(pixels[idx]) * smooth))
                pixels[idx + 1] = UInt8(clamping: Int(Double(pixels[idx + 1]) * smooth))
                pixels[idx + 2] = UInt8(clamping: Int(Double(pixels[idx + 2]) * smooth))
                pixels[idx + 3] = UInt8(clamping: Int(Double(pixels[idx + 3]) * smooth))
            }
        }
    }

    for x in 0..<width {
        let topAlpha = pixels[x * 4 + 3]
        if topAlpha > 16 {
            for y in 0..<min(height, fadeTopSpan) {
                let t = Double(y) / Double(fadeTopSpan)
                let smooth = 0.5 - 0.5 * cos(Double.pi * t)
                let idx = y * bytesPerRow + x * 4
                pixels[idx] = UInt8(clamping: Int(Double(pixels[idx]) * smooth))
                pixels[idx + 1] = UInt8(clamping: Int(Double(pixels[idx + 1]) * smooth))
                pixels[idx + 2] = UInt8(clamping: Int(Double(pixels[idx + 2]) * smooth))
                pixels[idx + 3] = UInt8(clamping: Int(Double(pixels[idx + 3]) * smooth))
            }
        }
    }

    var minX = width
    var maxX = 0
    var minY = height
    var maxY = 0
    var opaqueCount = 0

    for y in 0..<height {
        let rowStart = y * bytesPerRow
        for x in 0..<width {
            let a = pixels[rowStart + x * 4 + 3]
            if a > 24 {
                opaqueCount += 1
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
            }
        }
    }

    let totalPixels = width * height
    if opaqueCount < totalPixels / 28 || opaqueCount > Int(Double(totalPixels) * 0.88) || minX >= maxX || minY >= maxY {
        return nil
    }

    guard let processedCG = bmpCtx.makeImage() else {
        return nil
    }

    let padX = Int(Double(maxX - minX) * 0.08)
    let padTop = Int(Double(maxY - minY) * 0.05)
    let cropMinX = max(0, minX - padX)
    let cropMaxX = min(width, maxX + padX)
    let cropMinY = max(0, minY - padTop)
    let cropMaxY = maxY

    let cropRect = CGRect(
        x: cropMinX,
        y: cropMinY,
        width: max(1, cropMaxX - cropMinX),
        height: max(1, cropMaxY - cropMinY)
    )
    return processedCG.cropping(to: cropRect) ?? processedCG
}

// 1. Run VNGeneratePersonSegmentationRequest (.accurate) to get true human-only mask
var personMaskCI: CIImage? = nil
var personRatio: Double = 0

do {
    let segHandler = VNImageRequestHandler(ciImage: ciImage, options: [:])
    let segRequest = VNGeneratePersonSegmentationRequest()
    segRequest.qualityLevel = .accurate
    segRequest.outputPixelFormat = kCVPixelFormatType_OneComponent8
    try segHandler.perform([segRequest])
    if let observation = segRequest.results?.first {
        let maskBuffer = observation.pixelBuffer
        var m = CIImage(cvPixelBuffer: maskBuffer)
        let scaleX = extent.width / m.extent.width
        let scaleY = extent.height / m.extent.height
        m = m.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY)).cropped(to: extent)
        if let stats = computeMaskStats(m), stats.opaqueRatio >= 0.04, stats.opaqueRatio <= 0.85 {
            personMaskCI = m
            personRatio = stats.opaqueRatio
        }
    }
} catch {}

// 2. Run VNGenerateForegroundInstanceMaskRequest (macOS 14+ Subject Lift) for fine hair/edge alpha
var fgMaskCI: CIImage? = nil
var fgRatio: Double = 0

if #available(macOS 14.0, *) {
    do {
        let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
        let request = VNGenerateForegroundInstanceMaskRequest()
        try handler.perform([request])
        if let result = request.results?.first {
            let maskPixelBuffer = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
            let m = CIImage(cvPixelBuffer: maskPixelBuffer).cropped(to: extent)
            if let stats = computeMaskStats(m), stats.opaqueRatio >= 0.04, stats.opaqueRatio <= 0.84 {
                fgMaskCI = m
                fgRatio = stats.opaqueRatio
            }
        }
    } catch {}
}

var chosenMask: CIImage? = nil
if let pMask = personMaskCI, let fMask = fgMaskCI {
    // Use ForegroundInstanceMask if it agrees with PersonSegmentation (doesn't grab an entire background wall)
    if fgRatio <= personRatio * 1.28 && fgRatio >= personRatio * 0.45 {
        chosenMask = fMask.applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 0.85]).cropped(to: extent)
    } else {
        chosenMask = pMask.applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.15]).cropped(to: extent)
    }
} else if let pMask = personMaskCI {
    chosenMask = pMask.applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.15]).cropped(to: extent)
} else if let fMask = fgMaskCI {
    chosenMask = fMask.applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 0.95]).cropped(to: extent)
}

if let finalMask = chosenMask {
    let blend = CIFilter.blendWithMask()
    blend.inputImage = ciImage
    blend.backgroundImage = CIImage.empty().cropped(to: extent)
    blend.maskImage = finalMask
    if let outCI = blend.outputImage?.cropped(to: extent),
       let croppedCG = finalizeCutout(from: outCI),
       saveCGImageAsPNG(croppedCG, to: outputURL) {
        exit(0)
    }
}

exit(3)
