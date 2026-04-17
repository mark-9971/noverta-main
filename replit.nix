{pkgs}: {
  deps = [
    pkgs.chromium
    pkgs.libGL
    pkgs.udev
    pkgs.dbus
    pkgs.xorg.libxcb
    pkgs.cairo
    pkgs.pango
    pkgs.alsa-lib
    pkgs.mesa
    pkgs.libxkbcommon
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.expat
    pkgs.libdrm
    pkgs.cups
    pkgs.at-spi2-atk
    pkgs.nspr
    pkgs.nss
    pkgs.glib
  ];
}
