/*
 * General purpose utilities.
 *
 * Written by Anant Narayanan, unless otherwise specified.
 * Contributions by Philipp von Weitershausen.
 *
 */
Weave.Util = function() {
  function _XOR(a, b, isA) {
    if (a.length != b.length) {
      return false;
    }

    var val = [];
    for (var i = 0; i < a.length; i++) {
      if (isA) {
        val[i] = a[i] ^ b[i];
      } else {
        val[i] = a.charCodeAt(i) ^ b.charCodeAt(i);
      }
    }

    return val;
  }

  function _stringToHex(str) {
    var ret = '';
    for (var i = 0; i < str.length; i++) {
      var num = str.charCodeAt(i);
      var hex = num.toString(16);
      if (hex.length == 1) {
        hex = '0' + hex;
      }
      ret += hex;
    }
    return ret;
  }

  function _hexToString(hex) {
    var ret = '';
    if (hex.length % 2 != 0) {
      return false;
    }

    for (var i = 0; i < hex.length; i += 2) {
      var cur = hex[i] + hex[i + 1];
      ret += String.fromCharCode(parseInt(cur, 16));
    }
    return ret;
  }

  function _arrayToString(arr) {
    var ret = '';
    for (var i = 0; i < arr.length; i++) {
      ret += String.fromCharCode(arr[i]);
    }
    return ret;
  }

  function _stringToArray(str) {
    var ret = [];
    for (var i = 0; i < str.length; i++) {
      ret[i] = str.charCodeAt(i);
    }
    return ret;
  }

  /*
   * Convert characters in 'str' to bytes by cutting off all bits > 8
   */
  function _intify(str) {
    var ret = '';
    for (var i = 0; i < str.length; i++) {
      var cur = str.charCodeAt(i);
      ret += String.fromCharCode(cur & 0xff);
    }

    return ret;
  }

  function _clearify(str) {
    var ret = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code >= 32 && code <= 126) {
        ret += String.fromCharCode(code);
      }
    }

    return ret;
  }

  function _randomBytes(length) {
      var ret = [];
      for (var i = 0; i < length; i++) {
        // Generates uniformly distributed random integer between 0 and 255
        ret[i] = Math.floor(Math.random() * 256);
      }
      return _arrayToString(ret);
  }

  return {
    XOR: _XOR,
    HtS: _hexToString,
    StH: _stringToHex,
    AtS: _arrayToString,
    StA: _stringToArray,
    intify: _intify,
    clearify: _clearify,
    randomBytes: _randomBytes
  };

}();

/*
 * Generate a brand-new globally unique identifier (GUID).
 *
 * Subject to the Mozilla Public License Version 1.1
 * The Original Code is Bookmarks Sync.
 * The Initial Developer of the Original Code is Mozilla.
 *
 */
Weave.Util.makeGUID = function () {
    // 70 characters that are not-escaped URL-friendly
    var code =
      "!()*-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~";

    var guid = "";
    var num = 0;
    var val;

    // Generate ten 70-value characters for a 70^10 (~61.29-bit) GUID
    for (var i = 0; i < 10; i++) {
      // Refresh the number source after using it a few times
      if (i == 0 || i == 5)
        num = Math.random();

      // Figure out which code to use for the next GUID character
      num *= 70;
      val = Math.floor(num);
      guid += code[val];
      num -= val;
    }

    return guid;
};


/*
 * Generate a UUID according to RFC4122 v4 (random UUIDs)
 */
Weave.Util.makeUUID = function () {
    var chars = '0123456789abcdef';
    var uuid = [];
    var choice;

    uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
    uuid[14] = '4';

    for (var i = 0; i < 36; i++) {
        if (uuid[i]) {
            continue;
        }
        choice = Math.floor(Math.random() * 16);
        // Set bits 6 and 7 of clock_seq_hi to 0 and 1, respectively.
        // (cf. RFC4122 section 4.4)
        uuid[i] = chars[(i == 19) ? (choice & 3) | 8 : choice];
      }

    return uuid.join('');
};


/*
 * The JavaScript implementation of Base 64 encoding scheme
 * http://rumkin.com/tools/compression/base64.php
 *
 * Modified, 2008, Anant Narayanan <anant@kix.in>
 *
 * Public domain
 */
Weave.Util.Base64 = (function() {
  var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var encode, decode;

  function _encode64(input) {
    var i = 0;
    var output = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;

    while (i < input.length) {
      chr1 = input.charCodeAt(i++);
      chr2 = input.charCodeAt(i++);
      chr3 = input.charCodeAt(i++);

      enc1 = chr1 >> 2;
      enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
      enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
      enc4 = chr3 & 63;

      if (isNaN(chr2)) {
        enc3 = enc4 = 64;
      } else if (isNaN(chr3)) {
        enc4 = 64;
      }

      output = output + keyStr.charAt(enc1) + keyStr.charAt(enc2) + keyStr.charAt(enc3) + keyStr.charAt(enc4);
    }

    return output;
  }

  function _decode64(input) {
    var output = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;

    // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

    while (i < input.length) {
      enc1 = keyStr.indexOf(input.charAt(i++));
      enc2 = keyStr.indexOf(input.charAt(i++));
      enc3 = keyStr.indexOf(input.charAt(i++));
      enc4 = keyStr.indexOf(input.charAt(i++));

      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;

      output = output + String.fromCharCode(chr1);

      if (enc3 != 64) {
              output = output + String.fromCharCode(chr2);
      }

      if (enc4 != 64) {
              output = output + String.fromCharCode(chr3);
      }
    }

    return output;
  }


  // Mozilla and WebKit based browsers have native Base 64 conversion
  if ((typeof atob === "function") && (typeof btoa === "function")) {
    encode = function (input) { return btoa(input); };
    decode = function (input) { return atob(input); };
  } else {
    encode = _encode64;
    decode = _decode64;
  }

  return {
    encode: encode,
    decode: decode,

    // Expose these functions nonetheless for unit testing
    _encode: _encode64,
    _decode: _decode64
  };

}());
