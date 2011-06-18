
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



// implement a queue of XMLHttpRequests for a given object
function use_rqueue(obj) {

	// variables
	obj.r_queue= []; // remote queue (list of [payload, callback])

	// functons

	obj.r_queue_add = function (url, payload, callback) {
		var req = new XMLHttpRequest();
		req.open("POST", url, true);
		var params = '';
		for (key in payload) {
			params += (params?'&':'')+key+'='+encodeURIComponent(payload[key]);
		}
		this.r_queue_add_req(req, params, callback);
	};

	obj.r_queue_add_req = function (req, params, callback) {
		this.r_queue.push([req, params, callback]);
		if (!this.r_queue.running) {
			this.r_queue.running = true;
			this.updateStatus(statuses.UPLOADING);
			this.r_queue_next();
		}
	};

	obj.r_queue_next = function () {

		if (this.r_queue.length == 0) {
			console.log('Finished uploading');
			this.r_queue.running = false;
			this.updateStatus(statuses.READY); // update popup with 'finished' count

			// save current state when everything has been uploaded
			if (this.initial_commit) {
				this.save_state();
			}
			return;
		}

		// update the popup with the new 'left' count
		this.updateStatus(statuses.UPLOADING);

		var req      = this.r_queue[0][0];
		var params   = this.r_queue[0][1];
		var callback = this.r_queue[0][2];
		this.r_queue.shift();
		var obj = this;
		req.onreadystatechange = function () {
			if (req.readyState != 4) return; // not loaded
			// request completed
			if (req.status != 200) return;
			if (callback) callback(req);
			obj.r_queue_next(); // do the next push
		}
		req.send(params);
	};
}

function use_queue (obj) {
	// variables
	obj.queue = [];

	// functions
	
	obj.queue_add = function (callback, data) {
		this.queue.push([callback, data]);
		/*if (!this.queue.running) {
			this.queue_start();
		}*/ // will be started by commit();
	};

	obj.queue_start = function () {
		this.updateStatus(statuses.UPLOADING);
		this.queue.running = true;
		this.queue_next();
	};

	obj.queue_next = function () {
		var queue_item = this.queue.shift();
		if (!queue_item) {

			// save current state when everything has been uploaded
			// this occurs also when there is nothing in the queue when the
			// first commit happens.
			if (this.initial_commit) {
				this.save_state();
			}
			
			this.updateStatus(statuses.READY);

			// queue has been finished!!!
			return;
		}
		var callback = queue_item[0];
		var data     = queue_item[1];
		callback(data);

	};
}

