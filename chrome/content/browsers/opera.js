
/* Message passing */

window.addEventListener("load", function(){
	var theButton;
	var ToolbarUIItemProperties = {
		title: "Sync2all",
		icon: "/chrome/skin/icon.png",
		popup: {
			href: "/chrome/content/popup.html",
			width: 350,
			height: 150,
		}
	}
	theButton = opera.contexts.toolbar.createItem(ToolbarUIItemProperties);
	opera.contexts.toolbar.addItem(theButton);
}, false);

function onMessage(event) {
	console.log('bericht in main:'+event.data);
}
opera.extension.onmessage = onMessage;

function onConnect (event) {
	if (event.origin.indexOf("popup.html") > -1 &&
			event.origin.indexOf('widget://') > -1) {

		// save the port for future use (posting of messages);
		popup_port = event.source;

		// start sending of messages to the popup
		popupCreated();

		// give the popup the port
		event.source.postMessage({action: 'popup_give_port'});
	}
}
opera.extension.onconnect = onConnect;




