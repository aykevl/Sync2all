
// prefix: opl (OPera Link

var opl = {};

opl.name = 'Opera Link';

// imports
use_queue(opl);

var oauth;

// fix opera.link for Google Chrome
opera.link.authorizeFunction = function (url) {
	chrome.tabs.create({url: url});
}

opl.start = function () {
	// initialize variables
	opl.bookmarks = {bm: {}, f: {}}; // doesn't have a title
	opl.lastSync = 0;

	opera.link.consumer("immqSD074yPY83JWSKAzmjUUpOcC7u40", "RmLYnd49QRcDW89rCUkPgmBuTmkTfse6");
	opera.link.loadToken();
	opera.link.testAuthorization(opl.authorizationTested);
};

opl.finished_start = function () {
	target_finished(opl);
};

opl.requestTokenCallback = function (e) {
	opl.requestToken = e.token;
	opl.requestTokenSecret = e.secret;
	setTimeout(function () {
				opera.link.getAccessToken(opl.requestToken, opl.requestTokenSecret, prompt('Verifier:'), opl.accessTokenCallback, opl.accessTokenError);
			}, 10*1000);
};

opl.requestTokenError = function (e) {
	console.log('error getting request token:');
	console.log(e);
	alert('There was an error while connecting to Opera Link. See the log for details.');
};

opl.accessTokenCallback = function (e) {
	opera.link.saveToken();
	opl.loadBookmarks();
};

opl.accessTokenError = function (e) {
	console.log('error getting access token:');
	console.log(e);
	alert('There was an error while connecting to Opera Link. See the log for details.');
};

opl.authorizationTested = function (authorized) {
	if (authorized) {
		opl.loadBookmarks();
	} else {
		// authorize now
		opera.link.requestToken(opl.requestTokenCallback, opl.requestTokenError);
	}
};

opl.loadBookmarks = function () {
	opera.link.bookmarks.getAll(undefined, opl.bookmarksLoaded);
};

opl.bookmarksLoaded = function (result) {
	opl.parse_bookmarks(result.response, opl.bookmarks);
	opl.finished_start();
};

opl.parse_bookmarks = function (array, folder) {
	var item;
	for (var i=0; item=array[i]; i++) {
		if (item.item_type == 'bookmark_folder') {
			if (item.properties.title == 'Trash' && folder == opl.bookmarks) continue; // don't sync trashed bookmarks
			if (folder.f[item.properties.title]) {
				var subfolder = folder.f[item.properties.title];
				if (subfolder.opl_id) {
					console.log('FIXME: duplicate folder title: '+subfolder.title);
				}
				subfolder.opl_id = item.id;
			} else {
				var subfolder = {title: item.properties.title, parentNode: folder, bm: {}, f: {}, opl_id: item.id};
				folder.f[subfolder.title] = subfolder;
			}
			if (item.children) {
				opl.parse_bookmarks(item.children, subfolder);
			} else {
				console.log('empty folder: '+subfolder.title);
			}
		} else if (item.item_type == 'bookmark') {
			if (!folder.bm[item.properties.uri]) {
				var bookmark = {parentNode: folder, url: item.properties.uri, title: item.properties.title, opl_id: item.id};
				folder.bm[item.properties.uri] = bookmark;
			} else {
				bookmark = folder.bm[item.properties.uri];
				if (bookmark.opl_id) {
					console.log('FIXME: duplicate url: '+bookmark.url);
				}
				bookmark.opl_id = item.id;
			}
		}
	}
};

opl.itemCreated = function (result) {
	if (result.status != 200) {
		console.log('Error creating bookmark/folder:');
		console.log(result);
		return;
	}
	opl.current_item.opl_id = result.response.id;
	opl.queue_next();
};
opl.itemDeleted = function (result) {
	if (!result.status == 204) {
		console.log('Error deleting:');
		console.log(result);
		return;
	}
	opl.queue_next();
};


opl.bm_add = function (target, bm, folder) {
	if (!folder) var folder = bm.parentNode;
	opl.queue_add(
			function (bm) {
				if (!folder.opl_id && folder != g_bookmarks) {
					console.log('No parent ID! Bookmark:');
					console.log(bm);
					opl.queue_next();
					return;
				}
				opl.current_item = bm;
				// TODO: last visited timestamp, comments (from Google Bookmarks)
				opera.link.bookmarks.create({title: bm.title, uri: bm.url}, folder.opl_id, opl.itemCreated); //, created: timestamp(new Date(bm.timestamp))
			}, bm);
}

opl.f_add = function (target, folder) {
	opl.queue_add(function (folder) {
				if (!folder.parentNode.opl_id && folder.parentNode != g_bookmarks) {
					console.log('No parent ID! Folder:');
					console.log(folder);
					return;
				}
				opl.current_item = folder;
				opera.link.bookmarks.createFolder({title: folder.title}, folder.parentNode.opl_id, opl.itemCreated);
			}, folder);
}

opl.bm_del = opl.f_del = function (target, node) {
	opl.queue_add(
			function (node) {
				opera.link.bookmarks.deleteItem(node.opl_id, opl.itemDeleted);
			}, node);
}

opl.commit = function () {
	opl.queue_start(); // start running
}

