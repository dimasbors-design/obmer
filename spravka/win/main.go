// Справочник электрика — Windows-программа: окно WebView2 с встроенной веб-частью (работает без интернета).
package main

import (
	"embed"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"

	"github.com/jchv/go-webview2"
)

//go:embed web
var webFS embed.FS

// Постоянный порт: от него зависит, где браузер хранит введённые значения и отметки чек-листов.
const addr = "127.0.0.1:47391"

func main() {
	sub, _ := fs.Sub(webFS, "web")
	if ln, err := net.Listen("tcp", addr); err == nil {
		go http.Serve(ln, http.FileServer(http.FS(sub)))
	} // если порт занят — уже открыта другая копия программы, её сервер отдаёт те же файлы

	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "SpravkaElektrika")
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  data,
		WindowOptions: webview2.WindowOptions{
			Title:  "Справочник электрика",
			Width:  1280,
			Height: 820,
			IconId: 1,
			Center: true,
		},
	})
	if w == nil {
		os.Exit(1)
	}
	defer w.Destroy()
	w.SetSize(900, 600, webview2.HintMin)
	w.Navigate("http://" + addr + "/")
	w.Run()
}
