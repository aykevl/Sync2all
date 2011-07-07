
function Array_remove(array, element) {
	var index = array.indexOf(element);
	if (index == -1) {
		throw "Element "+element+" not found in array";
	}
	return array.splice(index, 1);
}

// See http://www.eahanson.com/2008/12/04/relative-dates-in-javascript/
/**
 * Simple relative date.
 *
 * Returns a string like "4 days ago". Prefers to return values >= 2. For example, it would
 * return "26 hours ago" instead of "1 day ago", but would return "2 days ago" instead of
 * "49 hours ago".
 *
 * Copyright (c) 2008 Erik Hanson http://www.eahanson.com/
 * Licensed under the MIT License http://www.opensource.org/licenses/mit-license.php
 */
function relativeDate(olderDate, newerDate) {
  if (typeof olderDate == "string") olderDate = new Date(parseInt(olderDate));
  if (typeof newerDate == "string") newerDate = new Date(newerDate);

  var milliseconds = newerDate - olderDate;

  var conversions = [
    ["years", 31518720000],
    ["months", 2626560000 /* assumes there are 30.4 days in a month */],
    ["days", 86400000],
    ["hours", 3600000],
    ["minutes", 60000],
    ["seconds", 1000]
  ];

  for (var i = 0; i < conversions.length; i++) {
    var result = Math.floor(milliseconds / conversions[i][1]);
    if (result >= 2) {
      return result + " " + conversions[i][0] + " ago";
    }
  }

  return "1 second ago";
}



// http://cbas.pandion.im/2009/10/generating-rfc-3339-timestamps-in.html
/*
 Internet Timestamp Generator
 Copyright (c) 2009 Sebastiaan Deckers
 License: GNU General Public License version 3 or later
*/
var timestamp = function (date) {
 var pad = function (amount, width) {
  var padding = "";
  while (padding.length < width - 1 && amount < Math.pow(10, width - padding.length - 1))
   padding += "0";
  return padding + amount.toString();
 }
 date = date ? date : new Date();
 var offset = date.getTimezoneOffset();
 return pad(date.getFullYear(), 4)
   + "-" + pad(date.getMonth() + 1, 2)
   + "-" + pad(date.getDate(), 2)
   + "T" + pad(date.getHours(), 2)
   + ":" + pad(date.getMinutes(), 2)
   + ":" + pad(date.getSeconds(), 2)
   + "." + pad(date.getMilliseconds(), 3)
   + (offset > 0 ? "-" : "+")
   + pad(Math.floor(Math.abs(offset) / 60), 2)
   + ":" + pad(Math.abs(offset) % 60, 2);
}
// End of Internet Timestamp Generator


// Base 32 encoder
// http://forthescience.org/blog/2010/11/30/base32-encoding-in-javascript/
// Released under the WTFPL (http://sam.zoy.org/wtfpl/) by Stefano Borini
var baseenc = baseenc || {};
 
baseenc.b32encode = function(s) {
 /* encodes a string s to base32 and returns the encoded string */
 var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
 
 var parts = [];
 var quanta= Math.floor((s.length / 5));
 var leftover = s.length % 5;
 
 if (leftover != 0) {
  for (var i = 0; i < (5-leftover); i++) { s += '\x00'; }
  quanta += 1;
 }
 
 for (i = 0; i < quanta; i++) {
  parts.push(alphabet.charAt(s.charCodeAt(i*5) >> 3));
  parts.push(alphabet.charAt( ((s.charCodeAt(i*5) & 0x07) << 2)
                               | (s.charCodeAt(i*5+1) >> 6)));
  parts.push(alphabet.charAt( ((s.charCodeAt(i*5+1) & 0x3F) >> 1) ));
  parts.push(alphabet.charAt( ((s.charCodeAt(i*5+1) & 0x01) << 4)
                               | (s.charCodeAt(i*5+2) >> 4)));
  parts.push(alphabet.charAt( ((s.charCodeAt(i*5+2) & 0x0F) << 1)
                               | (s.charCodeAt(i*5+3) >> 7)));
  parts.push(alphabet.charAt( ((s.charCodeAt(i*5+3) & 0x7F) >> 2)));
  parts.push(alphabet.charAt( ((s.charCodeAt(i*5+3) & 0x03) << 3)
                               | (s.charCodeAt(i*5+4) >> 5)));
  parts.push(alphabet.charAt( ((s.charCodeAt(i*5+4) & 0x1F) )));
 }
 
 var replace = 0;
 if (leftover == 1) replace = 6;
 else if (leftover == 2) replace = 4;
 else if (leftover == 3) replace = 3;
 else if (leftover == 4) replace = 1;
 
 for (i = 0; i < replace; i++) parts.pop();
 for (i = 0; i < replace; i++) parts.push("=");
 
 return parts.join("");
}

