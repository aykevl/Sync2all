'use strict';

/* Message passing code below. */

// handle general requests
function onRequest (request, sender, sendResponse) {
	if (request.action == 'popupCreated') {
		sync2all.onPopupCreation();
		sendResponse(undefined); // only because I have to
		return;
	}
	if (request.action == 'popupClosed') {
		sync2all.onPopupClosion();
		sendResponse(undefined); // because I have to
		return;
	}
	var webLink;
	for (var i=0; webLink=webLinks[i]; i++) {
		if (request.action.substr(0, webLink.id.length+1) == webLink.id+'_') {
			// convert linkid_action to msg_action
			webLink['msg_'+request.action.substr(request.action.indexOf('_')+1)].call(webLink, request, sender);
			return;
		}
	}
}

chrome.extension.onRequest.addListener(onRequest);



/* Browser extension (Chrome) */

function Browser () {
	BrowserBase.call(this);

	this.fullName = 'Google Chrome';
	this.name     = 'chrome';
	this.isPopupOpen = false;
};

browser = new Browser();

Browser.prototype.__proto__ = BrowserBase.prototype;

Browser.prototype.loadBookmarks = function (callback) {
	var bookmarks = new BookmarkCollection(this, {title: 'Bookmarks Bar', id: '1'});
	this.ids = bookmarks.ids;
	chrome.bookmarks.getSubTree(bookmarks.id,
			(function (tree) {
				this.gotTree(tree[0], bookmarks);
				callback(bookmarks, bookmarks.ids);
			}).bind(this));
};

Browser.prototype.startObserver = function () {
	// add event handlers
	chrome.bookmarks.onCreated.addListener(this.evt_onCreated.bind(this));
	chrome.bookmarks.onRemoved.addListener(this.evt_onRemoved.bind(this));
	chrome.bookmarks.onMoved.addListener  (this.evt_onMoved  .bind(this));
	chrome.bookmarks.onChanged.addListener(this.evt_onChanged.bind(this));
	return;
};

Browser.prototype.gotTree = function (browserParentNode, folder) {
	var browserNode;
	for (var i=0; browserNode=browserParentNode.children[i]; i++) {
		this.gotTree_handleNode(browserNode, folder);
	}
};

// handle chrome bookmark tree nodes, helper function for Browser.prototype.gotTree
Browser.prototype.gotTree_handleNode = function (node, folder) {
	if (node.url) {
		// bookmark
		folder.importBookmark({title: node.title, url: node.url, mtime: node.dateAdded/1000, id: node.id});
	} else {
		// folder

		// create the local node
		var subfolder = folder.importFolder({title: node.title, id: node.id});
		this.gotTree(node, subfolder); // recurse into subfolders
	}
};

// import an array of BookmarkTreeNodes
Browser.prototype.import_bms = function (results) {
	var result;
	for (var i=0; result=results[i]; i++) {
		var folder = sync2all.bookmarks.ids[result.parentId];
		if (result.url) {
			// bookmark
			folder.newBookmark({title: result.title, url: result.url, mtime: result.dateAdded/1000, id: result.id});
		} else {
			// folder
			var subfolder = folder.newFolder({title: result.title, id: result.id});
			chrome.bookmarks.getChildren(subfolder.id, this.import_bms);
		}
	}
};



/* Chrome link below. */

Browser.prototype.f_add  = function (source, folder) {
	this.queue_add(
			function (folder) {
				this.creating_parentId = folder.parentNode.id;
				this.creating_title    = folder.title;
				chrome.bookmarks.create({parentId: folder.parentNode.id, title: folder.title}, 
						function (result) {
							folder.id = result.id;
							sync2all.bookmarks.ids[folder.id] = folder;
							this.queue_next();
						}.bind(this));
			}.bind(this), folder);
};

Browser.prototype.f_del = function (source, folder) {
	// keep in the queue to prevent possible errors
	this.queue_add(
			function (folder) {
				chrome.bookmarks.removeTree(folder.id, this.queue_next.bind(this)); // can run without waiting
			}.bind(this), folder);
};

Browser.prototype.bm_add = function (source, bm) {
	this.queue_add(
			function (bm) {
				this.creating_parentId = bm.parentNode.id;
				this.creating_url      = bm.url;
				chrome.bookmarks.create({parentId: bm.parentNode.id, title: bm.title, url: bm.url},
						function (result) {
							bm.id = result.id;
							sync2all.bookmarks.ids[bm.id] = bm;
							this.queue_next();
						}.bind(this));
			}.bind(this), bm);
};

Browser.prototype.bm_del = function (source, bm) {
	// just to keep it safe, in the queue
	this.queue_add(
			function (bm) {
				chrome.bookmarks.remove(bm.id, this.queue_next.bind(this));
			}.bind(this), bm);
};

Browser.prototype.bm_mv = Browser.prototype.f_mv = function (target, node, oldParent) {
	this.queue_add(
			function (node) {
				chrome.bookmarks.move(node.id, {parentId: node.parentNode.id}, this.queue_next.bind(this));
			}.bind(this), node);
}

Browser.prototype.bm_mod_title = Browser.prototype.f_mod_title = function (target, node, oldtitle) {
	this.queue_add(
			function (node) {
				chrome.bookmarks.update(node.id, {title: node.title}, this.queue_next.bind(this));
			}.bind(this), node);
}

Browser.prototype.bm_mod_url = function (target, node, oldurl) {
	this.queue_add(
			function (node) {
				chrome.bookmarks.update(node.id, {url: node.url}, this.queue_next.bind(this));
			}.bind(this), node);
}


/*************************************
 * Listen to bookmark events
 ************************************/

Browser.prototype.evt_onCreated = function (id, node) {
	// make this object ready
	node.mtime = node.dateAdded/1000;
	// let the browser library handle the rest
	this.onCreated(node);
};

Browser.prototype.evt_onRemoved = function (id, removeInfo) {
	console.log('evt_onRemoved');
	if (!(id in sync2all.bookmarks.ids)) return; // already removed (or in the 'Other Bookmarks' menu)... FIXME this may change in a future version (like chrome.bookmarks.onCreated)
	var node = sync2all.bookmarks.ids[id];
	node.remove(this);
	sync2all.commit();
}

Browser.prototype.evt_onChanged = function (id, changeInfo) {
	console.log('evt_onChanged');
	var node = sync2all.bookmarks.ids[id];
	if (!node) return; // somewhere outside the synced folder (or bug)
	this.onChanged(node, changeInfo);
}

Browser.prototype.evt_onMoved = function (id, moveInfo) {
	console.log('evt_onMoved');

	this.onMoved(id, moveInfo.parentId, moveInfo.oldParentId);
}


Browser.prototype.import_node = function (id) {
	this.queue_add(
			function (id) {
				chrome.bookmarks.get(id,
						function (results) {
							this.import_bms(results);
							sync2all.commit();
							this.queue_next();
						}.bind(this));
			}.bind(this), id);
};

