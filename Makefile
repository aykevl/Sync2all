



all:
	/usr/lib/xulrunner-2.0/xpidl -m typelib -I /home/ayke/projects/libreoffice/clone/libs-extern-sys/moz/unxlngx6.pro/misc/build/mozilla/xpcom/base/ -w -v -e components/nsISync2allService.xpt components/nsISync2allService.idl

package:
	touch ../Sync2all.zip
	rm ../Sync2all.zip
	zip -r ../Sync2all.zip ./*
