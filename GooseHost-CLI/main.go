package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const DEFAULT_API = "https://page.goose.cc.cd"

// 由 ldflags 注入
var Version = "dev"

// ---------- 颜色 ----------
const (
	cReset   = "\033[0m"
	cRed     = "\033[91m"
	cGreen   = "\033[92m"
	cYellow  = "\033[93m"
	cBlue    = "\033[94m"
	cCyan    = "\033[96m"
	cBold    = "\033[1m"
	cDim     = "\033[2m"
)

var useColor = detectColor()

func detectColor() bool {
	if os.Getenv("NO_COLOR") != "" || os.Getenv("ANSI_COLORS_DISABLED") != "" {
		return false
	}
	fi, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

func c(text, color string) string {
	if !useColor || color == "" {
		return text
	}
	return color + text + cReset
}

func printSuccess(msg string) { fmt.Println(c("[OK] "+msg, cGreen)) }
func printError(msg string)   { fmt.Println(c("[FAIL] "+msg, cRed)) }
func printInfo(msg string)    { fmt.Println(c(msg, cCyan)) }
func printWarning(msg string) { fmt.Println(c(msg, cYellow)) }

// ---------- 配置目录 ----------
func configDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	dir := filepath.Join(home, ".goosehost")
	_ = os.MkdirAll(dir, 0700)
	return dir
}

func tokenPath() string { return filepath.Join(configDir(), "token") }
func userPath() string  { return filepath.Join(configDir(), "user") }

func loadToken() string {
	data, err := os.ReadFile(tokenPath())
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func loadUser() map[string]interface{} {
	data, err := os.ReadFile(userPath())
	if err != nil {
		return nil
	}
	var u map[string]interface{}
	if json.Unmarshal(data, &u) != nil {
		return nil
	}
	return u
}

func saveToken(token string, user map[string]interface{}) error {
	if err := os.WriteFile(tokenPath(), []byte(token), 0600); err != nil {
		return err
	}
	if user != nil {
		data, _ := json.Marshal(user)
		_ = os.WriteFile(userPath(), data, 0600)
	}
	return nil
}

func clearAuth() {
	_ = os.Remove(tokenPath())
	_ = os.Remove(userPath())
}

func requireToken() string {
	t := loadToken()
	if t == "" {
		printError("未配置 API 密钥，请先执行：goosehost login --key gooseh-xxx")
		os.Exit(1)
	}
	return t
}

func maskKey(k string) string {
	if len(k) <= 16 {
		return k
	}
	return k[:12] + "…" + k[len(k)-4:]
}

// ---------- HTTP ----------
var httpClient = &http.Client{Timeout: 30 * time.Second}

func apiRequest(method, urlStr, token string, body interface{}) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, urlStr, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return httpClient.Do(req)
}

func mustAPI(method, urlStr, token string, body interface{}) (*http.Response, []byte) {
	resp, err := apiRequest(method, urlStr, token, body)
	if err != nil {
		printError("请求错误: " + err.Error())
		os.Exit(1)
	}
	data, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode == 401 {
		printError("API 密钥无效或已被吊销（401）")
		os.Exit(1)
	}
	return resp, data
}

func getStr(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func errMsg(data []byte) string {
	var m map[string]interface{}
	if json.Unmarshal(data, &m) == nil {
		if s := getStr(m, "error"); s != "" {
			if hint := getStr(m, "hint"); hint != "" {
				return s + "（" + hint + "）"
			}
			return s
		}
		if s := getStr(m, "message"); s != "" {
			return s
		}
	}
	return string(data)
}

// 逐段 URL 编码，保留斜杠
func encodePath(p string) string {
	parts := strings.Split(p, "/")
	for i, s := range parts {
		parts[i] = url.PathEscape(s)
	}
	return strings.Join(parts, "/")
}

// ---------- 表格 ----------
func displayWidth(s string) int {
	w := 0
	for _, r := range s {
		if r > 0x1100 && (r <= 0x115F ||
			r == 0x2329 || r == 0x232A ||
			(r >= 0x2E80 && r <= 0xA4CF && r != 0x303F) ||
			(r >= 0xAC00 && r <= 0xD7A3) ||
			(r >= 0xF900 && r <= 0xFAFF) ||
			(r >= 0xFE30 && r <= 0xFE6F) ||
			(r >= 0xFF00 && r <= 0xFF60) ||
			(r >= 0xFFE0 && r <= 0xFFE6) ||
			(r >= 0x20000 && r <= 0x2FFFD) ||
			(r >= 0x30000 && r <= 0x3FFFD)) {
			w += 2
		} else {
			w++
		}
	}
	return w
}

func printTable(headers []string, rows [][]string) {
	if len(rows) == 0 {
		return
	}
	cols := len(headers)
	widths := make([]int, cols)
	for i, h := range headers {
		widths[i] = displayWidth(h)
	}
	for _, row := range rows {
		for i := 0; i < cols && i < len(row); i++ {
			if w := displayWidth(row[i]); w > widths[i] {
				widths[i] = w
			}
		}
	}
	sep := "+"
	for _, w := range widths {
		sep += strings.Repeat("-", w+2) + "+"
	}
	fmt.Println(sep)
	fmt.Print("|")
	for i, h := range headers {
		fmt.Printf(" %s%s |", h, strings.Repeat(" ", widths[i]-displayWidth(h)))
	}
	fmt.Println()
	fmt.Println(sep)
	for _, row := range rows {
		fmt.Print("|")
		for i := 0; i < cols; i++ {
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			fmt.Printf(" %s%s |", cell, strings.Repeat(" ", widths[i]-displayWidth(cell)))
		}
		fmt.Println()
	}
	fmt.Println(sep)
}

// ---------- 辅助 ----------
var stdinReader = bufio.NewReader(os.Stdin)

func readLine() string {
	line, _ := stdinReader.ReadString('\n')
	return strings.TrimSpace(line)
}

var slugRegex = regexp.MustCompile(`[^a-zA-Z0-9_\-.~]`)

func sanitizeSlug(s string) string {
	return slugRegex.ReplaceAllString(s, "-")
}

func buildVisitURL(api, slug, siteType string) string {
	paths := map[string]string{"html": "/s/", "md": "/md/", "project": "/p/"}
	base := strings.TrimRight(api, "/")
	p, ok := paths[siteType]
	if !ok {
		p = "/s/"
	}
	return base + p + slug
}

func zipDirToBase64(dir string) (string, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		w, err := zw.Create(filepath.ToSlash(rel))
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(w, f)
		return err
	})
	if err != nil {
		_ = zw.Close()
		return "", err
	}
	if err := zw.Close(); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

func getSiteType(api, token, slug string) string {
	resp, data := mustAPI("GET", api+"/api/my-sites", token, nil)
	if resp.StatusCode != 200 {
		return ""
	}
	var sites []map[string]interface{}
	if json.Unmarshal(data, &sites) != nil {
		return ""
	}
	for _, s := range sites {
		if getStr(s, "name") == slug {
			return getStr(s, "type")
		}
	}
	return ""
}

// ---------- 帮助 ----------
func printHelp() {
	fmt.Println()
	fmt.Println(c("GooseHost CLI", cBold+cCyan))
	fmt.Println(c("快速托管网站", cDim))
	fmt.Println()
	fmt.Println(c("  "+strings.Repeat("-", 50), cDim))
	fmt.Println("使用本产品前，请阅读:")
	fmt.Println(c("https://host.goose.cc.cd/docs/", cBlue))
	fmt.Println()
	fmt.Println("第一步：在网页端创建 API 密钥，然后:")
	fmt.Println(c("goosehost login --key gooseh-xxxxxxxx", cYellow))
	fmt.Println()
	fmt.Println(c("  "+strings.Repeat("-", 50), cDim))
	fmt.Println("查看全部命令:")
	fmt.Println(c("goosehost --help", cDim))
	fmt.Println("更详细命令解答:")
	fmt.Println(c("https://page.goose.cc.cd/md/cli/", cDim))
	fmt.Println("官网:")
	fmt.Println(c("https://host.goose.cc.cd/", cDim))
	fmt.Println()
}

func printSubHelp(name string) {
	fmt.Println()
	fmt.Println(c("GooseHost CLI - "+name, cBold+cCyan))
	fmt.Println()
	switch name {
	case "login":
		fmt.Println("用法: goosehost login --key <gooseh-xxx>")
		fmt.Println("  在网页端「账户 → API 密钥 → 新建密钥」创建后粘贴到这里")
	case "logout":
		fmt.Println("用法: goosehost logout")
	case "me":
		fmt.Println("用法: goosehost me")
		fmt.Println("  校验本地 API 密钥是否有效，并显示当前账号信息")
	case "config":
		fmt.Println("用法: goosehost config")
	case "list":
		fmt.Println("用法: goosehost list")
	case "list-files":
		fmt.Println("用法: goosehost list-files --slug <slug>")
	case "download":
		fmt.Println("用法: goosehost download --slug <slug> [--path <p>] [-o <file>]")
	case "create":
		fmt.Println("用法: goosehost create --slug <slug> [--type html|md|project] [--file <f>] [--content <s>]")
	case "get":
		fmt.Println("用法: goosehost get --slug <slug> [-o <file>]")
	case "update":
		fmt.Println("用法: goosehost update --slug <slug> [--file <f>] [--content <s>]")
	case "delete":
		fmt.Println("用法: goosehost delete --slug <slug> [--force]")
	case "put-file":
		fmt.Println("用法: goosehost put-file --slug <slug> --path <p> [--file <f>] [--content <s>]")
		fmt.Println("  仅适用于 project 类型站点")
	case "rm-file":
		fmt.Println("用法: goosehost rm-file --slug <slug> --path <p> [--force]")
		fmt.Println("  仅适用于 project 类型站点")
	case "deploy":
		fmt.Println("用法: goosehost deploy <path> [--slug <slug>]")
	}
	fmt.Println()
}

// ---------- 子命令 ----------
func cmdLogin(args []string, api string) {
	fs := flag.NewFlagSet("login", flag.ExitOnError)
	key := fs.String("key", "", "API 密钥（gooseh- 前缀）")
	_ = fs.Parse(args)
	if *key == "" {
		printError("--key 是必需的。请在网页端「账户 → API 密钥」创建后粘贴。")
		os.Exit(1)
	}
	if !strings.HasPrefix(*key, "gooseh-") {
		printWarning("密钥不以 gooseh- 开头，可能不是有效的 GooseHost API 密钥")
	}

	printInfo("正在校验密钥...")
	resp, data := mustAPI("GET", api+"/api/me", *key, nil)
	if resp.StatusCode != 200 {
		printError("密钥无效: " + errMsg(data))
		os.Exit(1)
	}
	var user map[string]interface{}
	if json.Unmarshal(data, &user) != nil {
		printError("解析响应失败")
		os.Exit(1)
	}
	if err := saveToken(*key, user); err != nil {
		printError("保存密钥失败: " + err.Error())
		os.Exit(1)
	}
	name := getStr(user, "email")
	if name == "" {
		name = getStr(user, "nickname")
	}
	if name == "" {
		name = maskKey(*key)
	}
	printSuccess("密钥已保存，欢迎，" + name)
}

func cmdMe(args []string, api string) {
	token := requireToken()
	resp, data := mustAPI("GET", api+"/api/me", token, nil)
	if resp.StatusCode != 200 {
		printError("校验失败: " + errMsg(data))
		os.Exit(1)
	}
	var user map[string]interface{}
	_ = json.Unmarshal(data, &user)

	fmt.Println()
	fmt.Println(c("当前账号", cBold+cCyan))
	fmt.Println("ID:")
	fmt.Println("  " + c(getStr(user, "id"), cYellow))
	fmt.Println("邮箱:")
	fmt.Println("  " + c(getStr(user, "email"), cYellow))
	nick := getStr(user, "nickname")
	if nick == "" {
		nick = "未设置"
	}
	fmt.Println("昵称:")
	fmt.Println("  " + c(nick, cYellow))
	fmt.Println("认证方式:")
	fmt.Println("  " + c(getStr(user, "authType"), cYellow))
	fmt.Println()

	// 刷新本地缓存
	_ = saveToken(token, user)
}

func cmdList(args []string, api string) {
	token := requireToken()
	resp, data := mustAPI("GET", api+"/api/my-sites", token, nil)
	if resp.StatusCode != 200 {
		printError("获取列表失败: " + errMsg(data))
		os.Exit(1)
	}
	var sites []map[string]interface{}
	if json.Unmarshal(data, &sites) != nil || len(sites) == 0 {
		printWarning("还没有创建任何网站，试试 goosehost create")
		return
	}
	rows := [][]string{}
	for _, s := range sites {
		t := getStr(s, "type")
		if t == "" {
			t = "html"
		}
		vc := "0"
		if v, ok := s["visit_count"]; ok {
			switch vv := v.(type) {
			case float64:
				vc = fmt.Sprintf("%d", int(vv))
			case string:
				vc = vv
			}
		}
		rows = append(rows, []string{getStr(s, "name"), t, vc})
	}
	printTable([]string{"名称", "类型", "访问量"}, rows)
}

func cmdListFiles(args []string, api string) {
	fs := flag.NewFlagSet("list-files", flag.ExitOnError)
	slug := fs.String("slug", "", "站点名称")
	_ = fs.Parse(args)
	if *slug == "" {
		printError("--slug 是必需的")
		os.Exit(1)
	}
	token := requireToken()
	resp, data := mustAPI("GET", api+"/api/site-files/"+url.PathEscape(*slug), token, nil)
	if resp.StatusCode != 200 {
		printError("获取文件列表失败: " + errMsg(data))
		os.Exit(1)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(data, &m)
	files, _ := m["files"].([]interface{})
	if len(files) == 0 {
		printWarning(fmt.Sprintf("站点 %s 没有文件", *slug))
		return
	}
	printInfo(fmt.Sprintf("站点 %s 的文件列表 (共 %d 个文件):", *slug, len(files)))
	fmt.Println()
	rows := [][]string{}
	for _, f := range files {
		fm, _ := f.(map[string]interface{})
		name := getStr(fm, "name")
		size := 0.0
		if v, ok := fm["size"].(float64); ok {
			size = v
		}
		var s string
		switch {
		case size < 1024:
			s = fmt.Sprintf("%.0f B", size)
		case size < 1024*1024:
			s = fmt.Sprintf("%.1f KB", size/1024)
		default:
			s = fmt.Sprintf("%.1f MB", size/(1024*1024))
		}
		rows = append(rows, []string{name, s})
	}
	printTable([]string{"文件名", "大小"}, rows)
}

func cmdDownload(args []string, api string) {
	fs := flag.NewFlagSet("download", flag.ExitOnError)
	slug := fs.String("slug", "", "站点名称")
	path := fs.String("path", "", "文件路径")
	output := fs.String("output", "", "保存到指定文件")
	fs.StringVar(output, "o", "", "保存到指定文件")
	_ = fs.Parse(args)
	if *slug == "" {
		printError("--slug 是必需的")
		os.Exit(1)
	}
	p := *path
	if p == "" {
		p = "index.html"
	}
	token := requireToken()
	printInfo(fmt.Sprintf("正在下载 %s/%s ...", *slug, p))
	u := api + "/api/proj-file/" + url.PathEscape(*slug) + "/" + encodePath(p)
	resp, data := mustAPI("GET", u, token, nil)
	if resp.StatusCode != 200 {
		printError("下载失败: " + errMsg(data))
		os.Exit(1)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(data, &m)
	content := getStr(m, "content")
	name := getStr(m, "name")
	if name == "" {
		name = filepath.Base(p)
	}
	out := *output
	if out == "" {
		out = name
	}
	if err := os.WriteFile(out, []byte(content), 0644); err != nil {
		printError("保存失败: " + err.Error())
		os.Exit(1)
	}
	printSuccess("文件已保存到 " + out)
}

func cmdCreate(args []string, api string) {
	fs := flag.NewFlagSet("create", flag.ExitOnError)
	slug := fs.String("slug", "", "网站名称")
	siteType := fs.String("type", "html", "网站类型")
	file := fs.String("file", "", "内容文件/目录")
	content := fs.String("content", "", "直接指定内容")
	_ = fs.Parse(args)
	if *slug == "" {
		printError("--slug 是必需的")
		os.Exit(1)
	}

	token := requireToken()
	var payload map[string]interface{}

	if *siteType == "project" {
		if *file == "" {
			printError("project 类型需要指定一个目录 (--file)")
			os.Exit(1)
		}
		fi, err := os.Stat(*file)
		if err != nil || !fi.IsDir() {
			printError("project 类型需要指定一个目录 (--file)")
			os.Exit(1)
		}
		printInfo(fmt.Sprintf("正在打包目录 %s ...", *file))
		b64, err := zipDirToBase64(*file)
		if err != nil {
			printError("打包失败: " + err.Error())
			os.Exit(1)
		}
		printInfo("正在上传压缩包...")
		payload = map[string]interface{}{"slug": *slug, "type": "project", "zip": b64}
	} else {
		var body string
		if *file != "" {
			b, err := os.ReadFile(*file)
			if err != nil {
				printError("读取文件失败: " + err.Error())
				os.Exit(1)
			}
			body = string(b)
		} else if *content != "" {
			body = *content
		} else {
			printError("必须指定 --file 或 --content")
			os.Exit(1)
		}
		if body == "" {
			printError("内容为空")
			os.Exit(1)
		}
		payload = map[string]interface{}{"slug": *slug}
		if *siteType == "md" {
			payload["md"] = body
		} else {
			payload["html"] = body
		}
	}

	resp, data := mustAPI("POST", api+"/api/create", token, payload)
	if resp.StatusCode == 409 {
		printError("创建失败: 该站点名称已被占用")
		os.Exit(1)
	}
	if resp.StatusCode == 429 {
		printError("创建失败: 触发限流（每 IP 每 60 秒 2 次），请稍后重试")
		os.Exit(1)
	}
	if resp.StatusCode != 200 {
		printError("创建失败: " + errMsg(data))
		os.Exit(1)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(data, &m)
	if ok, _ := m["success"].(bool); ok {
		st := "html"
		if *siteType == "md" {
			st = "md"
		}
		printSuccess("创建成功！")
		fmt.Println(c("访问地址:", cCyan))
		fmt.Println("  " + c(buildVisitURL(api, *slug, st), cCyan))
		fmt.Println(c("网站名称:", cCyan))
		fmt.Println("  " + c(getStr(m, "name"), cYellow))
		return
	}
	printError(fmt.Sprintf("创建失败: %v", m))
}

func cmdGet(args []string, api string) {
	fs := flag.NewFlagSet("get", flag.ExitOnError)
	slug := fs.String("slug", "", "网站名称")
	output := fs.String("output", "", "保存到文件")
	fs.StringVar(output, "o", "", "保存到文件")
	_ = fs.Parse(args)
	if *slug == "" {
		printError("--slug 是必需的")
		os.Exit(1)
	}
	s := *slug
	if strings.HasPrefix(s, "md/") {
		s = s[3:]
		printWarning("检测到 md/ 前缀，自动修正为: " + s)
	}
	token := requireToken()
	resp, data := mustAPI("GET", api+"/api/file/"+url.PathEscape(s), token, nil)
	if resp.StatusCode != 200 {
		printError("获取失败: " + errMsg(data))
		os.Exit(1)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(data, &m)
	content := getStr(m, "html")
	if content == "" {
		content = getStr(m, "md")
	}
	if *output != "" {
		if err := os.WriteFile(*output, []byte(content), 0644); err != nil {
			printError("保存文件失败: " + err.Error())
			os.Exit(1)
		}
		printSuccess("已保存到 " + *output)
		return
	}
	printInfo(fmt.Sprintf("站点 %s 的内容:", s))
	fmt.Println()
	fmt.Println(content)
}

func cmdUpdate(args []string, api string) {
	fs := flag.NewFlagSet("update", flag.ExitOnError)
	slug := fs.String("slug", "", "网站名称")
	file := fs.String("file", "", "内容文件")
	content := fs.String("content", "", "直接指定内容")
	_ = fs.Parse(args)
	if *slug == "" {
		printError("--slug 是必需的")
		os.Exit(1)
	}
	s := *slug
	if strings.HasPrefix(s, "md/") {
		s = s[3:]
		printWarning("检测到 md/ 前缀，自动修正为: " + s)
	}
	var body string
	if *file != "" {
		b, err := os.ReadFile(*file)
		if err != nil {
			printError("读取文件失败: " + err.Error())
			os.Exit(1)
		}
		body = string(b)
	} else if *content != "" {
		body = *content
	} else {
		printError("必须指定 --file 或 --content")
		os.Exit(1)
	}
	if body == "" {
		printError("内容为空")
		os.Exit(1)
	}

	token := requireToken()
	siteType := getSiteType(api, token, s)
	payload := map[string]interface{}{"slug": s}
	if siteType == "md" {
		payload["md"] = body
	} else {
		payload["html"] = body
	}

	resp, data := mustAPI("POST", api+"/api/update", token, payload)
	if resp.StatusCode != 200 {
		printError("更新失败: " + errMsg(data))
		os.Exit(1)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(data, &m)
	if ok, _ := m["success"].(bool); ok {
		printSuccess("更新成功！")
		return
	}
	printError(fmt.Sprintf("更新失败: %v", m))
}

func cmdDelete(args []string, api string) {
	fs := flag.NewFlagSet("delete", flag.ExitOnError)
	slug := fs.String("slug", "", "网站名称")
	force := fs.Bool("force", false, "强制删除")
	_ = fs.Parse(args)
	if *slug == "" {
		printError("--slug 是必需的")
		os.Exit(1)
	}
	s := *slug
	if strings.HasPrefix(s, "md/") {
		s = s[3:]
		printWarning("检测到 md/ 前缀，自动修正为: " + s)
	}
	if !*force {
		printWarning(fmt.Sprintf("确定要删除站点 %s 吗？此操作不可恢复！", s))
		fmt.Print("输入 yes 确认: ")
		if strings.ToLower(readLine()) != "yes" {
			printWarning("操作已取消")
			return
		}
	}
	token := requireToken()
	resp, data := mustAPI("POST", api+"/api/delete", token, map[string]string{"slug": s})
	if resp.StatusCode != 200 {
		printError("删除失败: " + errMsg(data))
		os.Exit(1)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(data, &m)
	if ok, _ := m["success"].(bool); ok {
		printSuccess("删除成功！")
		return
	}
	printError(fmt.Sprintf("删除失败: %v", m))
}

func cmdPutFile(args []string, api string) {
	fs := flag.NewFlagSet("put-file", flag.ExitOnError)
	slug := fs.String("slug", "", "站点名称")
	path := fs.String("path", "", "文件路径")
	file := fs.String("file", "", "从文件读取内容")
	content := fs.String("content", "", "直接指定内容")
	_ = fs.Parse(args)
	if *slug == "" || *path == "" {
		printError("--slug 和 --path 是必需的")
		os.Exit(1)
	}
	var body string
	if *file != "" {
		b, err := os.ReadFile(*file)
		if err != nil {
			printError("读取文件失败: " + err.Error())
			os.Exit(1)
		}
		body = string(b)
	} else if *content != "" {
		body = *content
	} else {
		printError("必须指定 --file 或 --content")
		os.Exit(1)
	}
	if len(body) > 200*1024 {
		printWarning("内容超过 200 KB，服务器可能拒绝")
	}
	token := requireToken()
	u := api + "/api/proj-file/" + url.PathEscape(*slug) + "/" + encodePath(*path)
	resp, data := mustAPI("PUT", u, token, map[string]string{"content": body})
	if resp.StatusCode != 200 {
		printError("写入失败: " + errMsg(data))
		os.Exit(1)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(data, &m)
	if ok, _ := m["success"].(bool); ok {
		printSuccess("写入成功: " + getStr(m, "name"))
		return
	}
	printError(fmt.Sprintf("写入失败: %v", m))
}

func cmdRmFile(args []string, api string) {
	fs := flag.NewFlagSet("rm-file", flag.ExitOnError)
	slug := fs.String("slug", "", "站点名称")
	path := fs.String("path", "", "文件路径")
	force := fs.Bool("force", false, "无需确认")
	_ = fs.Parse(args)
	if *slug == "" || *path == "" {
		printError("--slug 和 --path 是必需的")
		os.Exit(1)
	}
	if !*force {
		printWarning(fmt.Sprintf("确定要删除 %s/%s 吗？", *slug, *path))
		fmt.Print("输入 yes 确认: ")
		if strings.ToLower(readLine()) != "yes" {
			printWarning("操作已取消")
			return
		}
	}
	token := requireToken()
	u := api + "/api/proj-file/" + url.PathEscape(*slug) + "/" + encodePath(*path)
	resp, data := mustAPI("DELETE", u, token, nil)
	if resp.StatusCode != 200 {
		printError("删除失败: " + errMsg(data))
		os.Exit(1)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(data, &m)
	if ok, _ := m["success"].(bool); ok {
		printSuccess("已删除: " + getStr(m, "name"))
		return
	}
	printError(fmt.Sprintf("删除失败: %v", m))
}

func cmdConfig(args []string, api string) {
	token := loadToken()
	user := loadUser()
	fmt.Println()
	fmt.Println(c("GooseHost 配置信息", cBold+cCyan))
	fmt.Println("API 地址:")
	fmt.Println("  " + c(api, cYellow))
	fmt.Println("认证状态:")
	if token != "" {
		fmt.Println("  " + c("已配置 API 密钥", cGreen))
	} else {
		fmt.Println("  " + c("未配置", cRed))
	}
	if user != nil {
		fmt.Println("当前用户:")
		fmt.Println("  " + c(getStr(user, "email"), cYellow))
		fmt.Println("用户昵称:")
		nick := getStr(user, "nickname")
		if nick == "" {
			nick = "未设置"
		}
		fmt.Println("  " + c(nick, cYellow))
	}
	if token != "" {
		fmt.Println("API 密钥:")
		fmt.Println("  " + c(maskKey(token), cDim))
	}
	fmt.Println()
	fmt.Println(c("提示: 账号管理（注册、改昵称、创建/吊销密钥）请在网页端进行。", cDim))
	fmt.Println()
}

func cmdLogout(args []string, api string) {
	printWarning("确定要清除本地 API 密钥吗？(y/N)")
	ans := strings.ToLower(readLine())
	if ans == "y" || ans == "yes" {
		clearAuth()
		printSuccess("已清除本地凭证")
	}
}

func cmdDeploy(args []string, api string) {
	// 手动解析，支持位置参数在 --slug 前后
	var slugFlag, pathArg string
	i := 0
	for i < len(args) {
		a := args[i]
		switch {
		case a == "--slug" && i+1 < len(args):
			slugFlag = args[i+1]
			i += 2
		case strings.HasPrefix(a, "--slug="):
			slugFlag = a[len("--slug="):]
			i++
		case pathArg == "" && !strings.HasPrefix(a, "-"):
			pathArg = a
			i++
		default:
			i++
		}
	}
	if pathArg == "" {
		printError("需要指定要部署的路径")
		printSubHelp("deploy")
		os.Exit(1)
	}

	token := requireToken()
	fi, err := os.Stat(pathArg)
	if err != nil {
		printError(fmt.Sprintf("路径 '%s' 不存在", pathArg))
		os.Exit(1)
	}

	// ---- 文件 ----
	if !fi.IsDir() {
		ext := strings.ToLower(filepath.Ext(pathArg))
		var siteType string
		switch ext {
		case ".html", ".htm":
			siteType = "html"
		case ".md", ".markdown":
			siteType = "md"
		default:
			printError("仅支持 .html、.md 文件或目录")
			os.Exit(1)
		}
		b, err := os.ReadFile(pathArg)
		if err != nil {
			printError("读取文件失败: " + err.Error())
			os.Exit(1)
		}
		body := string(b)
		if body == "" {
			printError("文件内容为空")
			os.Exit(1)
		}
		slug := slugFlag
		if slug == "" {
			stem := strings.TrimSuffix(filepath.Base(pathArg), filepath.Ext(pathArg))
			slug = sanitizeSlug(stem)
			if slug == "" {
				slug = "my-site"
			}
			printWarning("未指定 --slug，自动生成: " + slug)
		}
		payload := map[string]interface{}{"slug": slug}
		if siteType == "md" {
			payload["md"] = body
		} else {
			payload["html"] = body
		}
		printInfo(fmt.Sprintf("正在部署 %s ...", filepath.Base(pathArg)))
		resp, data := mustAPI("POST", api+"/api/create", token, payload)
		if resp.StatusCode == 409 {
			printError(fmt.Sprintf("部署失败: 站点名称 '%s' 已被占用", slug))
			os.Exit(1)
		}
		if resp.StatusCode != 200 {
			printError("部署失败: " + errMsg(data))
			os.Exit(1)
		}
		var m map[string]interface{}
		_ = json.Unmarshal(data, &m)
		if ok, _ := m["success"].(bool); ok {
			printSuccess("部署成功！")
			fmt.Println(c("访问地址:", cCyan))
			fmt.Println("  " + c(buildVisitURL(api, slug, siteType), cCyan))
			fmt.Println(c("网站名称:", cCyan))
			fmt.Println("  " + c(slug, cYellow))
			return
		}
		printError(fmt.Sprintf("部署失败: %v", m))
		return
	}

	// ---- 目录 ----
	slug := slugFlag
	if slug == "" {
		slug = sanitizeSlug(filepath.Base(pathArg))
		if slug == "" {
			slug = "my-app"
		}
		printWarning("未指定 --slug，自动生成: " + slug)
	}
	printInfo(fmt.Sprintf("正在打包目录 %s ...", filepath.Base(pathArg)))
	b64, err := zipDirToBase64(pathArg)
	if err != nil {
		printError("打包失败: " + err.Error())
		os.Exit(1)
	}
	printInfo("正在上传压缩包...")
	payload := map[string]interface{}{"slug": slug, "type": "project", "zip": b64}
	resp, data := mustAPI("POST", api+"/api/create", token, payload)
	if resp.StatusCode == 409 {
		printError(fmt.Sprintf("部署失败: 站点名称 '%s' 已被占用", slug))
		os.Exit(1)
	}
	if resp.StatusCode != 200 {
		printError("部署失败: " + errMsg(data))
		os.Exit(1)
	}
	var m map[string]interface{}
	_ = json.Unmarshal(data, &m)
	if ok, _ := m["success"].(bool); ok {
		printSuccess("部署成功！")
		fmt.Println(c("访问地址:", cCyan))
		fmt.Println("  " + c(buildVisitURL(api, slug, "project"), cCyan))
		fmt.Println(c("网站名称:", cCyan))
		fmt.Println("  " + c(slug, cYellow))
		fmt.Println(c("类型:", cCyan))
		fmt.Println("  " + c("多文件站点 (beta)", cYellow))
		return
	}
	printError(fmt.Sprintf("部署失败: %v", m))
}

// ---------- 主入口 ----------
func main() {
	args := os.Args[1:]

	api := os.Getenv("GOOSEHOST_API")
	if api == "" {
		api = DEFAULT_API
	}

	// 全局 --api 提取
	filtered := []string{}
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "--api" && i+1 < len(args):
			api = args[i+1]
			i++
		case strings.HasPrefix(a, "--api="):
			api = a[len("--api="):]
		default:
			filtered = append(filtered, a)
		}
	}
	args = filtered

	if len(args) == 0 {
		printHelp()
		return
	}

	cmd := args[0]
	rest := args[1:]

	if cmd == "--help" || cmd == "-h" || cmd == "help" {
		if len(rest) > 0 {
			printSubHelp(rest[0])
			return
		}
		printHelp()
		return
	}

	if cmd == "--version" || cmd == "-v" || cmd == "version" {
		fmt.Println("goosehost " + Version)
		return
	}

	switch cmd {
	case "login":
		cmdLogin(rest, api)
	case "logout":
		cmdLogout(rest, api)
	case "me":
		cmdMe(rest, api)
	case "config":
		cmdConfig(rest, api)
	case "list":
		cmdList(rest, api)
	case "list-files":
		cmdListFiles(rest, api)
	case "download":
		cmdDownload(rest, api)
	case "create":
		cmdCreate(rest, api)
	case "get":
		cmdGet(rest, api)
	case "update":
		cmdUpdate(rest, api)
	case "delete":
		cmdDelete(rest, api)
	case "put-file":
		cmdPutFile(rest, api)
	case "rm-file":
		cmdRmFile(rest, api)
	case "deploy":
		cmdDeploy(rest, api)
	default:
		printError("未知命令: " + cmd)
		fmt.Println()
		printHelp()
		os.Exit(1)
	}
}