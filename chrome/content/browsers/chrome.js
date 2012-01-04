'use strict';

/* Message passing code below. */

// handle general requests
function onRequest (request, sender, sendResponse) {
	if (request.action == 'popupCreated') {
		sync2all.onPopupCreation();
		sendResponse(undefined); // only because I have to
	} else if (request.action == 'popupClosed') {
		sync2all.onPopupClosion();
		sendResponse(undefined); // because I have to
	}
}

chrome.extension.onRequest.addListener(onRequest);



/* Browser extension (Chrome) */

function Browser () {
	this.fullName = 'Google Chrome';
	this.name     = 'chrome';
};

Browser.prototype = new BrowserBase();

Browser.prototype.loadBookmarks = function (callback) {
	var bookmarks = {bm: [], f: [], title: 'Bookmarks Bar', id: '1'};
	var idIndex   = {'1': bookmarks};
	this.ids       = idIndex;
	chrome.bookmarks.getSubTree(bookmarks.id,
			(function (tree) {
				this.gotTree(idIndex, tree[0], bookmarks);
				callback(bookmarks, idIndex);
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

Browser.prototype.gotTree = function (idIndex, browserParentNode, folder) {
	var browserNode;
	for (var i=0; browserNode=browserParentNode.children[i]; i++) {
		this.gotTree_handleNode(idIndex, browserNode, folder);
	}
};

// handle chrome bookmark tree nodes, helper function for Browser.prototype.gotTree
Browser.prototype.gotTree_handleNode = function (idIndex, node, folder) {
	if (node.url) {
		// bookmark

		var bookmark = {title: node.title, url: node.url, parentNode: folder, mtime: node.dateAdded/1000, id: node.id};
		this.importBookmark(idIndex, bookmark);
	} else {
		// folder

		// create the local node
		var subfolder = {title: node.title, parentNode: folder, bm: {}, f: {}, id: node.id};
		this.gotTree(idIndex, node, subfolder); // recurse into subfolders

		this.importFolder(idIndex, subfolder);

	}
};

// import an array of BookmarkTreeNodes
Browser.prototype.import_bms = function (results) {
	var result;
	for (var i=0; result=results[i]; i++) {
		var folder = this.ids[result.parentId];
		if (result.url) {
			// bookmark
			var bm = {title: result.title, url: result.url, mtime: result.dateAdded, parentNode: folder, id: result.id};
			if (addBookmark(this, bm)) continue; // error
		} else {
			// folder
			var subfolder = {bm: {}, f: {}, title: result.title, parentNode: folder, id: result.id};
			addFolder(this, subfolder);
			chrome.bookmarks.getChildren(subfolder.id, this.import_bms);
		}
	}
	sync2all.commit(); // not the most ideal place
};




/* Chrome link below. */

Browser.prototype.f_add  = function (source, folder) {
	this.queue_add(
			function (folder) {
				if (!folder.parentNode.id) {
					console.log('ERROR; No parentId for folder:');
					console.log(folder);
					this.queue_next();
					return;
				}
				this.creating_parentId = folder.parentNode.id;
				this.creating_title    = folder.title;
				chrome.bookmarks.create({parentId: folder.parentNode.id, title: folder.title}, 
						function (result) {
							folder.id = result.id;
							this.ids[folder.id] = folder;
							this.queue_next();
						}.bind(this));
			}.bind(this), folder);
};

Browser.prototype.f_del = function (source, folder) {
	// remove own references
	delete this.ids[folder.id];
	// remove global references
	_rmFolder(folder);
	// keep in the queue to prevent possible errors
	this.queue_add(
			function (folder) {
				chrome.bookmarks.removeTree(folder.id, this.queue_next.bind(this)); // can run without waiting
			}.bind(this), folder);
};

Browser.prototype.bm_add = function (source, bm, lfolder) {
	if (!lfolder) lfolder = bm.parentNode;
	this.queue_add(
			function (data) {
				this.creating_parentId = data.lfolder.id;
				this.creating_url      = data.bm.url;
				chrome.bookmarks.create({parentId: data.lfolder.id, title: data.bm.title, url: data.bm.url},
						function (result) {
							data.bm.id = result.id;
							this.ids[data.bm.id] = data.bm;
							this.queue_next();
						}.bind(this));
			}.bind(this), {bm: bm, lfolder: lfolder});
};

Browser.prototype.bm_del = function (source, bm) {
	// remove this from our data
	// this keeps evt_onRemoved from calling broadcastMessage('bm_del', ...)
	delete this.ids[bm.id];
	// delete global reference
	_rmBookmark(bm); // _ before it so it won't call bm_del on all links
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

browser = new Browser();

// import libraries, kind of inheritance
import_treeBasedLink(browser, true);
import_queue(browser);


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
	if (!(id in sync2all.bookmarkIds)) {console.log('not here');return;} // already removed (or in the 'Other Bookmarks' menu)... FIXME this may change in a future version (like chrome.bookmarks.onCreated)
	var node = sync2all.bookmarkIds[id];
	if (node.url) {
		// bookmark
		var bookmark = node;
		rmBookmark(this, bookmark);
	} else {
		// folder
		console.log('Removed folder: '+node.title);
		rmFolder(this, node);
	}
	sync2all.commit();
}

Browser.prototype.evt_onChanged = function (id, changeInfo) {
	console.log('evt_onChanged');
	var node = sync2all.bookmarkIds[id];
	if (!node) return; // somewhere outside the synced folder (or bug)
	onChanged(this, node, changeInfo);
	sync2all.commit();
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
							this.queue_next();
						}.bind(this));
			}.bind(this), id);
};

