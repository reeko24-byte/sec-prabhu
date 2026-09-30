/* Turning a raw capture into the photograph that is stored and sent: orient,
 * resize, stamp, compress. Taken from the WT app; what changed is the mark.
 *
 * Three things are burned into the pixels:
 *
 *   top right     the post's BADGE -- Billy's artwork, one per post, drawn
 *                 SOLID. It is a white card, so it reads on grass, sky and a
 *                 photographed document alike; WT's transparent white mark
 *                 needed an outline to survive a pale background, this does not.
 *   bottom band   what the report is, who, when, the coordinates and address
 *   bottom right  the verification code (see seal.js)
 *
 * Every badge is drawn at the SAME HEIGHT -- a fraction of the frame's shorter
 * side -- because the artwork's widths differ (SORA is short, Kota Batak
 * Junction long) and matching the height is what makes every post look the same
 * size. A very wide badge on a narrow portrait frame is capped by width instead.
 *
 * Behind the band's text runs a faint diagonal micro-print of the timestamp and
 * code, so painting over the printed time cuts visible lines.
 */

(function (SA) {

  var TARGET_MAX_DIMENSION = 1600;
  var MAX_FILE_BYTES = 400000;
  var THUMB_DIMENSION = 200;

  /* -- The two numbers that decide how the badge sits ---------------------- */
  var BADGE_HEIGHT_FRACTION = 0.10;   // of the frame's shorter side
  var BADGE_MAX_WIDTH_FRACTION = 0.62; // of the frame's width

  var MAX_BAND_FRACTION = 0.38;
  var BAND_FONT_FRACTION = 0.026;

  var SANS = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';

  /* -- Decoding ---------------------------------------------------------- */

  function decodeOriented(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () { return decodeViaImg(file); });
    }
    return decodeViaImg(file);
  }

  function decodeViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Foto tidak bisa dibaca'));
      };
      img.src = url;
    });
  }

  function drawScaled(source, maxDimension) {
    var width = source.width || source.naturalWidth;
    var height = source.height || source.naturalHeight;
    var scale = Math.min(maxDimension / width, maxDimension / height, 1);
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function toBlob(canvas, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', quality);
    });
  }

  function compress(canvas, ceiling) {
    var quality = 0.8;
    function attempt() {
      return toBlob(canvas, quality).then(function (blob) {
        if (blob.size <= ceiling || quality <= 0.3) return blob;
        quality -= 0.1;
        return attempt();
      });
    }
    return attempt();
  }

  /* -- The badge ---------------------------------------------------------- */

  /* One decode per badge, reused for every photo of the shift. */
  var badgeCache = {};

  function loadBadge(src) {
    if (!src) return Promise.resolve(null);
    if (badgeCache[src]) return badgeCache[src];
    badgeCache[src] = new Promise(function (resolve) {
      var img = new Image();
      // Null, never a rejection: a missing badge must not cost a photograph.
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
    return badgeCache[src];
  }

  /**
   * Draws the badge into the top right corner, or the words of `fallback` in
   * type when there is no artwork (Patrol and Walkthrough, until theirs arrive).
   */
  function burnBadge(canvas, badge, fallback) {
    var context = canvas.getContext('2d');
    var shorter = Math.min(canvas.width, canvas.height);
    var margin = Math.round(shorter * 0.025);

    if (badge) {
      var height = Math.round(shorter * BADGE_HEIGHT_FRACTION);
      var width = Math.round(height * badge.naturalWidth / badge.naturalHeight);
      var maxWidth = Math.round(canvas.width * BADGE_MAX_WIDTH_FRACTION);
      if (width > maxWidth) {
        width = maxWidth;
        height = Math.round(width * badge.naturalHeight / badge.naturalWidth);
      }
      context.drawImage(badge, canvas.width - margin - width, margin, width, height);
      return;
    }

    if (!fallback) return;
    var size = Math.round(canvas.width * 0.026);
    context.save();
    context.font = '700 ' + size + 'px ' + SANS;
    context.textAlign = 'right';
    context.textBaseline = 'top';
    context.lineJoin = 'round';
    context.lineWidth = Math.max(2, size * 0.18);
    context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    context.fillStyle = '#FFFFFF';
    String(fallback).split('\n').forEach(function (text, index) {
      var y = margin + index * size * 1.15;
      context.strokeText(text, canvas.width - margin, y);
      context.fillText(text, canvas.width - margin, y);
    });
    context.restore();
  }

  /* -- The bottom band ---------------------------------------------------- */

  function burnMicroPrint(context, band, phrase) {
    if (!phrase) return;
    var size = Math.max(7, Math.round(band.font * 0.30));
    var step = size * 2.6;
    var repeated = new Array(40).join(phrase + '   ');

    context.save();
    context.beginPath();
    context.rect(band.left, band.top, band.width, band.height);
    context.clip();
    context.globalAlpha = 0.10;
    context.fillStyle = '#FFFFFF';
    context.font = '500 ' + size + 'px ' + MONO;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.translate(band.left, band.top);
    context.rotate(-14 * Math.PI / 180);
    var reach = band.width + band.height;
    for (var y = -band.height; y < reach; y += step) {
      context.fillText(repeated, -band.height, y);
    }
    context.restore();
  }

  function sealMetrics(context, size, seal, prefix) {
    var codeSize = Math.round(size * 0.95);
    var labelSize = Math.round(codeSize * 0.58);
    var previous = context.font;
    context.font = '700 ' + codeSize + 'px ' + MONO;
    var codeWidth = context.measureText(seal.code).width;
    context.font = '600 ' + labelSize + 'px ' + SANS;
    var labelWidth = context.measureText(SA.seal.labelFor(seal.algo, prefix)).width;
    context.font = previous;
    return { code: codeSize, label: labelSize, width: Math.max(codeWidth, labelWidth) };
  }

  function sealFootprint(context, size, seal, prefix) {
    if (!seal || !seal.code) return 0;
    var metrics = sealMetrics(context, size, seal, prefix);
    return metrics.width + metrics.code * 1.6;
  }

  function burnSeal(context, band, seal, prefix) {
    if (!seal || !seal.code) return;
    var metrics = sealMetrics(context, band.font, seal, prefix);
    var codeSize = metrics.code;
    var labelSize = metrics.label;
    var right = band.left + band.width - band.padding;
    var bottom = band.top + band.height - band.padding * 0.7;

    context.save();
    context.textAlign = 'right';
    context.textBaseline = 'alphabetic';
    context.fillStyle = 'rgba(0, 0, 0, 0.45)';
    context.fillRect(right - metrics.width - codeSize * 0.45,
      bottom - codeSize - labelSize - codeSize * 0.7,
      metrics.width + codeSize * 0.9, codeSize + labelSize + codeSize * 0.9);
    context.fillStyle = 'rgba(255, 255, 255, 0.82)';
    context.font = '600 ' + labelSize + 'px ' + SANS;
    context.fillText(SA.seal.labelFor(seal.algo, prefix), right, bottom - codeSize * 1.25);
    context.fillStyle = '#FFFFFF';
    context.font = '700 ' + codeSize + 'px ' + MONO;
    context.fillText(seal.code, right, bottom);
    context.restore();
  }

  /** Breaks lines that do not fit, at word boundaries. */
  function wrapLines(context, lines, maxWidth) {
    var out = [];
    lines.forEach(function (line) {
      if (context.measureText(line).width <= maxWidth) { out.push(line); return; }
      var words = String(line).split(' ');
      var current = '';
      words.forEach(function (word) {
        var candidate = current ? current + ' ' + word : word;
        if (current && context.measureText(candidate).width > maxWidth) {
          out.push(current);
          current = word;
        } else {
          current = candidate;
        }
      });
      if (current) out.push(current);
    });
    return out;
  }

  function burnBand(canvas, lines, timestamp, seal, prefix) {
    var context = canvas.getContext('2d');
    var ceiling = canvas.height * MAX_BAND_FRACTION;
    var fontSize = canvas.width * BAND_FONT_FRACTION;

    function measure(size) {
      var padding = size * 0.62;
      var lineHeight = size * 1.30;
      context.font = '600 ' + size + 'px ' + SANS;
      var sealWidth = sealFootprint(context, size, seal, prefix);
      var wrapped = wrapLines(context, lines, canvas.width - padding * 2 - sealWidth);
      return {
        size: size, padding: padding, lineHeight: lineHeight, lines: wrapped,
        height: lineHeight * wrapped.length + padding * 2
      };
    }

    var layout = measure(fontSize);
    if (layout.height > ceiling) layout = measure(fontSize * (ceiling / layout.height));

    var band = {
      left: 0, top: canvas.height - layout.height, width: canvas.width,
      height: layout.height, padding: layout.padding, font: layout.size
    };

    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillRect(band.left, band.top, band.width, band.height);
    burnMicroPrint(context, band, seal && seal.code ? timestamp + '  ' + seal.code : timestamp);
    burnSeal(context, band, seal, prefix);

    context.save();
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.font = '600 ' + layout.size + 'px ' + SANS;
    context.shadowColor = 'rgba(0, 0, 0, 0.9)';
    context.shadowBlur = 4;
    context.shadowOffsetX = 1;
    context.shadowOffsetY = 1;
    context.fillStyle = '#FFFFFF';
    layout.lines.forEach(function (line, index) {
      var baseline = band.top + layout.padding +
        (index + 1) * layout.lineHeight - layout.lineHeight * 0.28;
      context.fillText(line, layout.padding, baseline);
    });
    context.restore();
  }

  SA.photo = {

    /**
     * Raw camera file in, stored photograph out: { blob, thumb, width, height }.
     *
     * stamp = {
     *   lines      the band's text, top to bottom; blanks are dropped
     *   timestamp  for the micro-print
     *   seal       from SA.seal.compute(), on the ORIGINAL file
     *   sealPrefix "SEC" -> SEC-VERIFY
     *   badge      path of the badge artwork, or null
     *   fallback   words to set in type when there is no badge
     * }
     */
    process: function (file, stamp) {
      return Promise.all([decodeOriented(file), loadBadge(stamp.badge)]).then(function (loaded) {
        var source = loaded[0];
        var badge = loaded[1];

        var canvas = drawScaled(source, TARGET_MAX_DIMENSION);
        var thumbCanvas = drawScaled(source, THUMB_DIMENSION);
        if (source.close) source.close();

        var lines = (stamp.lines || []).filter(function (line) {
          return line && String(line).trim();
        });

        burnBadge(canvas, badge, stamp.fallback);
        burnBand(canvas, lines, stamp.timestamp || '', stamp.seal, stamp.sealPrefix);

        return Promise.all([compress(canvas, MAX_FILE_BYTES), toBlob(thumbCanvas, 0.6)])
          .then(function (results) {
            return { blob: results[0], thumb: results[1], width: canvas.width, height: canvas.height };
          });
      });
    },

    /** Warms the badge so the first photo of a shift is not slower. */
    preload: function (src) { return loadBadge(src); }
  };
}(window.SA));
