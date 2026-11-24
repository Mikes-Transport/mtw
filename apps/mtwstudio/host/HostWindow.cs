using System.Net.Http.Headers;
using System.Drawing.Imaging;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MTWStudio.Host;

public sealed class HostWindow : Form
{
    private readonly TextBox endpoint = new() { Text = "https://mtwstudio.mtwaustin.workers.dev", Width = 390 };
    private readonly TextBox secret = new() { Width = 390, UseSystemPasswordChar = true };
    private readonly ComboBox mode = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 260 };
    private readonly Label codeLabel = new() { Text = "Not connected", AutoSize = true, Font = new Font("Segoe UI", 17, FontStyle.Bold) };
    private readonly Label status = new() { Text = "Offline", AutoSize = true };
    private readonly Button save = new() { Text = "Save settings", Width = 130, Height = 34 };
    private readonly Button start = new() { Text = "Start host", Width = 130, Height = 34 };
    private readonly Button stop = new() { Text = "Disconnect / Stop", Width = 170, Height = 34, Enabled = false };
    private readonly Panel browserHolder = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(11, 17, 29) };
    private WebView2? browser;
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly SemaphoreSlim socketSend = new(1, 1);
    private ClientWebSocket? socket;
    private CancellationTokenSource? running;
    private Uri? baseUri;
    private string? connectionCode;
    private CancellationTokenSource? captureCancellation;
    private int selectedMonitorIndex;
    private int nextFrameId;
    private readonly System.Windows.Forms.Timer clipboardTimer = new() { Interval = 650 };
    private string? lastClipboardText;
    private TaskCompletionSource<bool>? frameAcknowledgement;
    private int awaitingFrameId;
    private bool approved;
    private bool browserReady;
    private bool browserNavigationCompleted;
    private string? browserLoadProblem;
    private ulong? capturePageNavigationId;
    private const string LocalHostPage = "https://mtwstudio-host.local/host.html";
    private readonly string appData = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MTWStudio");
    private readonly string configPath;
    private string? activeSession;

    public HostWindow()
    {
        configPath = Path.Combine(appData, "host-settings.json");
        Text = "MTWStudio · Remote Host";
        Size = new Size(630, 455);
        MinimumSize = new Size(580, 400);
        BackColor = Color.FromArgb(242, 241, 239);
        ForeColor = Color.FromArgb(36, 36, 36);
        Font = new Font("Segoe UI", 9);
        endpoint.Width = 360;
        secret.Width = 360;
        mode.Width = 250;
        codeLabel.Font = new Font("Segoe UI", 15, FontStyle.Bold);
        codeLabel.ForeColor = Color.FromArgb(36, 36, 36);
        start.BackColor = Color.FromArgb(36, 36, 36);
        start.ForeColor = Color.White;
        start.FlatStyle = FlatStyle.Flat;
        stop.FlatStyle = FlatStyle.Flat;
        stop.BackColor = Color.White;
        stop.ForeColor = Color.FromArgb(150, 40, 40);
        save.FlatStyle = FlatStyle.Flat;
        save.BackColor = Color.White;
        save.ForeColor = Color.FromArgb(36, 36, 36);
        var settingsButton = new Button {
            Text = "Settings", Width = 95, Height = 34,
            BackColor = Color.White, ForeColor = Color.FromArgb(36, 36, 36),
            FlatStyle = FlatStyle.Flat
        };
        mode.Items.AddRange(new object[] { "Connection code required", "Allow connections while open" });
        mode.SelectedIndex = 0;
        var head = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(15), ColumnCount = 2, BackColor = Color.White };
        head.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130));
        head.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var heading = new Label {
            Text = "MTWStudio  /  Windows host", AutoSize = true,
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            ForeColor = Color.FromArgb(36, 36, 36), Padding = new Padding(0, 0, 0, 10)
        };
        AddRow(head, "", heading);
        AddRow(head, "Status", status);
        AddRow(head, "Connection code", codeLabel);
        AddRow(head, "Access mode", mode);
        var settingsPanel = new TableLayoutPanel { AutoSize = true, ColumnCount = 2, Visible = !File.Exists(configPath) };
        settingsPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 75));
        settingsPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        AddRow(settingsPanel, "Server", endpoint);
        AddRow(settingsPanel, "PC key", secret);
        AddRow(settingsPanel, "", save);
        AddRow(head, "", settingsPanel);
        settingsButton.Click += (_, _) => {
            settingsPanel.Visible = !settingsPanel.Visible;
            settingsButton.Text = settingsPanel.Visible ? "Hide settings" : "Settings";
        };
        var controls = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        controls.Controls.Add(start);
        controls.Controls.Add(stop);
        controls.Controls.Add(settingsButton);
        AddRow(head, "", controls);
        browserHolder.BackColor = Color.FromArgb(242, 241, 239);
        browserHolder.Controls.Add(new Label {
            Text = "Ready to connect\\n\\nYour settings are saved on this PC.\\nDisplays are detected automatically when a session starts.",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Color.FromArgb(111, 111, 108)
        });
        Controls.Add(browserHolder);
        Controls.Add(head);
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = true;
        WindowState = FormWindowState.Normal;
        Shown += (_, _) => { Activate(); BringToFront(); };

        save.Click += (_, _) => {
            try { SaveSettings(); SetStatus("Settings saved on this PC"); }
            catch (Exception error) { MessageBox.Show(this, error.Message, "Could not save settings"); }
        };
        start.Click += async (_, _) => await StartHost();
        stop.Click += async (_, _) => await StopHost();
        FormClosing += (_, _) => {
            running?.Cancel();
            captureCancellation?.Cancel();
            try { socket?.Abort(); } catch { }
            clipboardTimer.Stop();
            clipboardTimer.Dispose();
            browser?.Dispose();
        };
        clipboardTimer.Tick += async (_, _) => await WatchClipboard();
        LoadSettings();
    }

    private string PrepareCapturePage()
    {
        // Embedded at publish time so the native host does not depend on a
        // remote web page loading, changing, or being restricted by iframe CSP.
        var assets = Path.Combine(appData, "capture-page");
        Directory.CreateDirectory(assets);
        var assembly = typeof(HostWindow).Assembly;
        foreach (var file in new[] {
            (Name: "host.html", Resource: "MTWStudio.Host.CapturePage.html"),
            (Name: "host.js", Resource: "MTWStudio.Host.CapturePage.js")
        })
        {
            using var source = assembly.GetManifestResourceStream(file.Resource)
                ?? throw new InvalidOperationException("Capture resource missing: " + file.Resource);
            using var destination = File.Create(Path.Combine(assets, file.Name));
            source.CopyTo(destination);
        }
        return assets;
    }

    private static void AddRow(TableLayoutPanel panel, string label, Control control)
    {
        var row = panel.RowCount++;
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        var caption = new Label { Text = label, AutoSize = true, Padding = new Padding(0, 7, 0, 0), ForeColor = Color.FromArgb(111, 111, 108) };
        panel.Controls.Add(caption, 0, row);
        panel.Controls.Add(control, 1, row);
    }

    private void SetStatus(string text)
    {
        if (!IsDisposed && IsHandleCreated) BeginInvoke(() => status.Text = text);
    }

    private void LoadSettings()
    {
        try
        {
            if (!File.Exists(configPath)) return;
            using var doc = JsonDocument.Parse(File.ReadAllText(configPath));
            var root = doc.RootElement;
            if (root.TryGetProperty("endpoint", out var saved)) endpoint.Text = saved.GetString() ?? endpoint.Text;
            if (root.TryGetProperty("mode", out var selected)) mode.SelectedIndex = selected.GetString() == "paired" ? 1 : 0;
            if (root.TryGetProperty("key", out var key))
            {
                // Only the current Windows user can decrypt the host credential.
                var raw = Convert.FromBase64String(key.GetString() ?? "");
                secret.Text = Encoding.UTF8.GetString(ProtectedData.Unprotect(raw, null, DataProtectionScope.CurrentUser));
            }
        }
        catch { /* Missing or invalid local settings: require entry again. */ }
    }

    private void SaveSettings()
    {
        Directory.CreateDirectory(appData);
        var encrypted = ProtectedData.Protect(Encoding.UTF8.GetBytes(secret.Text.Trim()), null, DataProtectionScope.CurrentUser);
        File.WriteAllText(configPath, JsonSerializer.Serialize(new {
            endpoint = endpoint.Text.Trim().TrimEnd('/'),
            mode = mode.SelectedIndex == 1 ? "paired" : "code",
            key = Convert.ToBase64String(encrypted)
        }));
    }

    private static string NormalizeHostKey(string value)
    {
        // Copying a key from a browser may include grouping dashes, newlines or
        // Unicode hyphens. These are formatting only, not part of the credential.
        var compact = new StringBuilder();
        foreach (char ch in value.Trim())
        {
            if (char.IsWhiteSpace(ch) || ch is '-' or '\u2010' or '\u2011' or '\u2012' or '\u2013' or '\u2014' or '\u2212')
                continue;
            compact.Append(ch);
        }
        var key = compact.ToString();
        // Existing 64-character host credentials remain valid.
        return System.Text.RegularExpressions.Regex.IsMatch(key, "^[a-f0-9]{64}$")
            ? key
            : key.ToUpperInvariant();
    }

    private async Task<JsonElement> Request(string path, HttpMethod method, object? payload, CancellationToken ct)
    {
        if (baseUri is null) throw new InvalidOperationException("Server is not configured");
        using var req = new HttpRequestMessage(method, new Uri(baseUri, path));
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", NormalizeHostKey(secret.Text));
        if (payload != null) req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        using var res = await http.SendAsync(req, ct);
        var data = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode) throw new InvalidOperationException("Server rejected request (" + (int)res.StatusCode + "): " + data);
        return JsonDocument.Parse(data).RootElement.Clone();
    }

    private async Task StartHost()
    {
        start.Enabled = false;
        try
        {
            if (!Uri.TryCreate(endpoint.Text.Trim(), UriKind.Absolute, out var uri) ||
                uri.Scheme != Uri.UriSchemeHttps || uri.UserInfo.Length != 0 || uri.Query.Length != 0 ||
                uri.Fragment.Length != 0 || uri.AbsolutePath != "/")
                throw new InvalidOperationException("Enter the HTTPS base URL of the MTWStudio server.");
            var hostKey = NormalizeHostKey(secret.Text);
            if (!System.Text.RegularExpressions.Regex.IsMatch(hostKey, "^(?:[A-Z0-9]{20}|[a-f0-9]{64})$"))
                throw new InvalidOperationException(
                    $"PC setup key has {hostKey.Length} characters after removing dashes and spaces. " +
                    "Expected 20 characters (or 64 for an older key). Copy the key directly from the MTWStudio dashboard.");
            baseUri = uri;
            SaveSettings();
            running = new CancellationTokenSource();
            approved = false;
            selectedMonitorIndex = Array.FindIndex(Screen.AllScreens, screen => screen.Primary);
            if (selectedMonitorIndex < 0) selectedMonitorIndex = 0;
            activeSession = null;
            browserReady = false;
            browserNavigationCompleted = false;
            browserLoadProblem = null;
            capturePageNavigationId = null;
            codeLabel.Text = "Connecting…";
            SetStatus("Registering host…");
            await Request("/api/agent/mode", HttpMethod.Post,
                new { mode = mode.SelectedIndex == 1 ? "paired" : "code" }, running.Token);
            var issued = await Request("/api/agent/code", HttpMethod.Post, new { }, running.Token);
            connectionCode = issued.GetProperty("code").GetString();
            if (string.IsNullOrEmpty(connectionCode)) throw new InvalidOperationException("No code received");
            codeLabel.Text = string.Join(" ", Enumerable.Range(0, 4).Select(i => connectionCode.Substring(i * 4, 4)));
            browser ??= new WebView2 { Dock = DockStyle.Fill };
            if (!browserHolder.Controls.Contains(browser))
            {
                browserHolder.Controls.Clear();
                browserHolder.Controls.Add(browser);
            }
            await browser.EnsureCoreWebView2Async();
            browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "mtwstudio-host.local", PrepareCapturePage(), CoreWebView2HostResourceAccessKind.DenyCors);
            browser.CoreWebView2.Settings.IsWebMessageEnabled = true;
            browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.AreHostObjectsAllowed = false;
            browser.CoreWebView2.WebMessageReceived -= BrowserMessage;
            browser.CoreWebView2.WebMessageReceived += BrowserMessage;
            browser.CoreWebView2.NavigationStarting += (_, args) =>
            {
                if (baseUri == null || !Uri.TryCreate(args.Uri, UriKind.Absolute, out var target))
                {
                    args.Cancel = true;
                    return;
                }
                // WebView2 may cancel its initial about:blank navigation when a
                // page is supplied. That cancellation is not a capture failure.
                if (target.AbsoluteUri == "about:blank") return;
                var expected = new Uri(LocalHostPage);
                if (target.Scheme != expected.Scheme || target.Authority != expected.Authority ||
                    target.AbsolutePath != expected.AbsolutePath)
                {
                    args.Cancel = true;
                    return;
                }
                capturePageNavigationId = args.NavigationId;
                browserLoadProblem = null;
                browserNavigationCompleted = false;
            };
            browser.CoreWebView2.NavigationCompleted += async (_, args) =>
            {
                // Only consider the actual capture-page navigation. In particular,
                // ignore OperationCanceled from initial about:blank or other
                // disallowed navigations.
                if (capturePageNavigationId != args.NavigationId) return;
                if (!args.IsSuccess)
                {
                    browserLoadProblem = "Host capture page could not load (" + args.WebErrorStatus + ").";
                    SetStatus(browserLoadProblem);
                    return;
                }
                browserNavigationCompleted = true;
                try
                {
                    // This message is intentionally sent only for the approved
                    // capture page, not an arbitrary navigated document.
                    await browser.CoreWebView2.ExecuteScriptAsync(
                        "window.chrome?.webview?.postMessage({type:'host-web-ready'});");
                }
                catch (Exception error)
                {
                    browserLoadProblem = "Host capture bridge could not start: " + error.Message;
                    SetStatus(browserLoadProblem);
                }
            };
            browser.Source = new Uri(LocalHostPage);
            stop.Enabled = true;
            endpoint.Enabled = false;
            secret.Enabled = false;
            mode.Enabled = false;

            socket = new ClientWebSocket();
            socket.Options.SetRequestHeader("Authorization", "Bearer " + NormalizeHostKey(secret.Text));
            var wsUri = new UriBuilder(new Uri(baseUri, "/api/agent/ws?code=" + connectionCode)) { Scheme = "wss", Port = -1 }.Uri;
            await socket.ConnectAsync(wsUri, running.Token);
            SetStatus($"Online · {Screen.AllScreens.Length} monitors detected · ready for approval");
            _ = ReceiveLoop(running.Token);
            _ = HeartbeatLoop(running.Token);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "MTWStudio could not start", MessageBoxButtons.OK, MessageBoxIcon.Error);
            await StopHost();
        }
        finally { start.Enabled = running == null; }
    }

    private async Task HeartbeatLoop(CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(60), ct);
                if (connectionCode == null) break;
                await Request("/api/agent/heartbeat", HttpMethod.Post, new { code = connectionCode }, ct);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { SetStatus("Heartbeat failed: " + ex.Message); }
    }

    private async Task WatchClipboard()
    {
        if (!approved || activeSession == null || running is not { IsCancellationRequested: false }) return;
        try
        {
            if (!Clipboard.ContainsText(TextDataFormat.UnicodeText)) return;
            var text = Clipboard.GetText(TextDataFormat.UnicodeText);
            if (text.Length > 8192 || text == lastClipboardText) return;
            lastClipboardText = text;
            await Send(new { type = "clipboard-update", text }, running.Token);
        }
        catch (Exception) { /* Clipboard can be temporarily locked by another app. */ }
    }

    private async Task ReceiveLoop(CancellationToken ct)
    {
        var buffer = new byte[65536];
        try
        {
            while (socket?.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                using var message = new MemoryStream();
                ValueWebSocketReceiveResult chunk;
                do
                {
                    chunk = await socket.ReceiveAsync(buffer.AsMemory(), ct);
                    if (chunk.MessageType == WebSocketMessageType.Close) return;
                    message.Write(buffer, 0, chunk.Count);
                    if (message.Length > 65536) throw new InvalidOperationException("Signalling message too large");
                } while (!chunk.EndOfMessage);
                if (chunk.MessageType != WebSocketMessageType.Text) continue;
                var payload = Encoding.UTF8.GetString(message.ToArray());
                using var data = JsonDocument.Parse(payload);
                var type = data.RootElement.GetProperty("type").GetString();
                if (type == "request")
                {
                    var id = data.RootElement.GetProperty("sessionId").GetString();
                    var name = data.RootElement.TryGetProperty("controllerName", out var display)
                        ? display.GetString() ?? "Manager" : "Manager";
                    if (id == null) continue;
                    BeginInvoke(async () => await Approve(id, name, ct));
                }
                else if (type == "controller-ready")
                {
                    if (approved && activeSession != null)
                    {
                        SetStatus("Viewer connected · secure relay streaming");
                        await SendMonitorList(ct);
                    }
                }
                else if (type == "select-monitor")
                {
                    if (approved && activeSession != null &&
                        data.RootElement.TryGetProperty("index", out var index) &&
                        index.TryGetInt32(out var chosen))
                        BeginInvoke(() => SelectMonitor(chosen));
                }
                else if (type == "frame-ack")
                {
                    if (data.RootElement.TryGetProperty("id", out var acknowledged) &&
                        acknowledged.TryGetInt32(out var frameId) && frameId == awaitingFrameId)
                        frameAcknowledgement?.TrySetResult(true);
                }
                else if (type == "clipboard-set" || type == "clipboard-get")
                {
                    if (approved && activeSession != null)
                    {
                        // WinForms clipboard access requires the STA UI thread.
                        // Never access the clipboard outside an approved session.
                        var textToSet = type == "clipboard-set" &&
                            data.RootElement.TryGetProperty("text", out var supplied) &&
                            supplied.ValueKind == JsonValueKind.String ? supplied.GetString() : null;
                        var requestId = data.RootElement.TryGetProperty("requestId", out var rid) &&
                            rid.ValueKind == JsonValueKind.String ? rid.GetString() ?? "" : "";
                        if (requestId.Length is < 1 or > 64) continue;
                        var operation = type;
                        BeginInvoke(async () =>
                        {
                            if (!approved || activeSession == null || running is not { IsCancellationRequested: false }) return;
                            try
                            {
                                if (operation == "clipboard-set")
                                {
                                    if (textToSet == null || textToSet.Length > 8192)
                                        throw new InvalidOperationException("Text must be 8,192 characters or less.");
                                    Clipboard.SetText(textToSet, TextDataFormat.UnicodeText);
                                    lastClipboardText = textToSet;
                                    await Send(new { type = "clipboard-result", requestId, operation = "set", ok = true }, running.Token);
                                }
                                else
                                {
                                    var text = Clipboard.ContainsText(TextDataFormat.UnicodeText)
                                        ? Clipboard.GetText(TextDataFormat.UnicodeText) : "";
                                    if (text.Length > 8192)
                                        throw new InvalidOperationException("PC clipboard exceeds 8,192 characters.");
                                    await Send(new { type = "clipboard-result", requestId, operation = "get", ok = true, text }, running.Token);
                                }
                            }
                            catch (Exception error)
                            {
                                if (running is { IsCancellationRequested: false })
                                    await Send(new { type = "clipboard-result", requestId, operation = operation == "clipboard-set" ? "set" : "get", ok = false, error = error.Message[..Math.Min(180,error.Message.Length)] }, running.Token);
                            }
                        });
                    }
                }
                else if (type == "input")
                {
                    if (approved && activeSession != null && data.RootElement.TryGetProperty("data", out var input))
                    {
                        if (input.TryGetProperty("type", out var inputType) && inputType.GetString() == "selectMonitor" &&
                            input.TryGetProperty("index", out var selected) && selected.TryGetInt32(out var index))
                            BeginInvoke(() => SelectMonitor(index));
                        else
                            RemoteInput.Apply(input, selectedMonitorIndex);
                    }
                }
                else if (type is "answer" or "ice")
                {
                    if (approved && activeSession != null) PostBrowser(payload);
                }
                else if (type == "end")
                {
                    BeginInvoke(() => EndSession());
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { SetStatus("Disconnected: " + ex.Message); }
        finally
        {
            if (!ct.IsCancellationRequested && IsHandleCreated)
                BeginInvoke(async () => await StopHost());
        }
    }

    private async Task Approve(string id, string name, CancellationToken ct)
    {
        if (approved || activeSession != null) { await Send(new { type = "reject" }, ct); return; }
        // A connection request may arrive before WebView2 finishes loading.
        // Do not reject immediately while the capture bridge is still starting.
        for (var attempt = 0; attempt < 50 && !browserReady && browserLoadProblem == null; attempt++)
        {
            if (ct.IsCancellationRequested) return;
            await Task.Delay(100, ct);
        }
        if (!browserReady || Screen.AllScreens.Length == 0)
        {
            var reason = browserLoadProblem ??
                (browserNavigationCompleted
                    ? "The embedded host page loaded, but the WebView2 bridge did not respond."
                    : "The embedded host page has not finished loading.");
            MessageBox.Show(this, reason + "\n\nCheck the Cloudflare deployment and restart the host.",
                "Screen capture unavailable", MessageBoxButtons.OK, MessageBoxIcon.Information);
            await Send(new { type = "reject" }, ct);
            return;
        }
        // Paired-access mode is intentionally an explicit host setting:
        // while this app is running, authenticated managers may connect without
        // another popup. Connection-code mode still requires local approval.
        if (mode.SelectedIndex != 1)
        {
            var answer = MessageBox.Show(this,
                name + " has requested control of this computer. Allow viewing, mouse clicks and keyboard input?\n\n" +
                "You can stop the session at any time.", "Approve MTWStudio connection?",
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
            if (answer != DialogResult.Yes)
            {
                await Send(new { type = "reject" }, ct);
                return;
            }
        }
        activeSession = id;
        approved = true;
        lastClipboardText = null;
        clipboardTimer.Start();
        SetStatus("Remote session active · " + name + " · press Disconnect to stop");
        await Send(new { type = "approve" }, ct);
        await SendMonitorList(ct);
        // The secure WebSocket relay is the default transport. It works on
        // networks where peer-to-peer WebRTC cannot complete ICE negotiation.
        captureCancellation?.Cancel();
        captureCancellation = CancellationTokenSource.CreateLinkedTokenSource(ct);
        _ = Task.Run(() => CaptureLoop(captureCancellation.Token), captureCancellation.Token);
    }

    private async Task Send(object payload, CancellationToken ct)
    {
        var ws = socket;
        if (ws == null || ws.State != WebSocketState.Open) return;
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload));
        await socketSend.WaitAsync(ct);
        try { if (ws.State == WebSocketState.Open) await ws.SendAsync(bytes.AsMemory(), WebSocketMessageType.Text, true, ct); }
        finally { socketSend.Release(); }
    }

    private void PostBrowser(string payload)
    {
        if (IsDisposed || !browserReady || browser?.CoreWebView2 == null) return;
        if (InvokeRequired) BeginInvoke(() => PostBrowser(payload));
        else browser.CoreWebView2.PostWebMessageAsJson(payload);
    }

    private async void BrowserMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (!Uri.TryCreate(args.Source, UriKind.Absolute, out var source) ||
            source.GetLeftPart(UriPartial.Path) != LocalHostPage) return;
        try
        {
            using var doc = JsonDocument.Parse(args.WebMessageAsJson);
            var root = doc.RootElement;
            var type = root.GetProperty("type").GetString();
            if (type == "host-web-ready") { browserReady = true; return; }
            if (!approved || running == null || activeSession == null) return;
            if (type is "offer" or "ice" or "peer-failed")
            {
                if (type == "peer-failed") { await StopHost(); return; }
                await Send(new { type, data = root.GetProperty("data").Clone() }, running.Token);
            }
            else if (type == "input")
            {
                var input = root.GetProperty("data");
                if (input.TryGetProperty("type", out var inputType) && inputType.GetString() == "selectMonitor" &&
                    input.TryGetProperty("index", out var index) && index.TryGetInt32(out var chosen))
                    SelectMonitor(chosen);
                else
                    RemoteInput.Apply(input, selectedMonitorIndex);
            }
        }
        catch (Exception ex) { SetStatus("Host input error: " + ex.Message); }
    }

    private void EndSession()
    {
        captureCancellation?.Cancel();
        captureCancellation = null;
        clipboardTimer.Stop();
        lastClipboardText = null;
        frameAcknowledgement?.TrySetResult(false);
        frameAcknowledgement = null;
        approved = false;
        activeSession = null;
        PostBrowser(JsonSerializer.Serialize(new { type = "stop" }));
        SetStatus("Online · waiting for another approved connection");
    }

    private async Task SendMonitorList(CancellationToken ct)
    {
        var monitors = Screen.AllScreens.Select((screen, index) => new {
            index,
            label = "Monitor " + (index + 1) + (screen.Primary ? " (Primary)" : ""),
            width = screen.Bounds.Width,
            height = screen.Bounds.Height
        }).ToArray();
        await Send(new { type = "monitors", monitors, selected = selectedMonitorIndex }, ct);
    }

    private void SelectMonitor(int index)
    {
        if (!approved || index < 0 || index >= Screen.AllScreens.Length) return;
        if (selectedMonitorIndex == index) return;
        selectedMonitorIndex = index;
        // Stop waiting for the previous monitor's frame to be acknowledged.
        frameAcknowledgement?.TrySetResult(false);
        SetStatus($"Remote session · viewing monitor {index + 1}");
        if (running is { IsCancellationRequested: false })
            _ = SendMonitorList(running.Token).ContinueWith(_ => { });
    }

    private async Task CaptureLoop(CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested && approved && !IsDisposed)
            {
                var screens = Screen.AllScreens;
                var index = Math.Clamp(selectedMonitorIndex, 0, screens.Length - 1);
                var bounds = screens[index].Bounds;
                if (bounds.Width < 1 || bounds.Height < 1) break;
                // GDI capture runs on a worker thread. No browser screen-picker is involved.
                var maxWidth = 1280d;
                var factor = Math.Min(1d, maxWidth / bounds.Width);
                var width = Math.Max(1, (int)(bounds.Width * factor));
                var height = Math.Max(1, (int)(bounds.Height * factor));
                string frame;
                using (var original = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb))
                {
                    using (var graphics = Graphics.FromImage(original))
                        graphics.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
                    using var scaled = new Bitmap(width, height, PixelFormat.Format24bppRgb);
                    using (var graphics = Graphics.FromImage(scaled))
                        graphics.DrawImage(original, 0, 0, width, height);
                    using var buffer = new MemoryStream();
                    var encoder = ImageCodecInfo.GetImageEncoders().First(x => x.FormatID == ImageFormat.Jpeg.Guid);
                    using var quality = new EncoderParameters(1);
                    quality.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 48L);
                    scaled.Save(buffer, encoder, quality);
                    frame = Convert.ToBase64String(buffer.ToArray());
                }
                if (!ct.IsCancellationRequested && approved && index == selectedMonitorIndex)
                {
                    const int chunkLength = 10000;
                    var count = (frame.Length + chunkLength - 1) / chunkLength;
                    if (count <= 96)
                    {
                        var frameId = Interlocked.Increment(ref nextFrameId);
                        var acknowledgement = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                        awaitingFrameId = frameId;
                        frameAcknowledgement = acknowledgement;
                        for (var chunk = 0; chunk < count && approved && !ct.IsCancellationRequested &&
                             index == selectedMonitorIndex; chunk++)
                        {
                            var offset = chunk * chunkLength;
                            await Send(new {
                                type = "frame", id = frameId, index = chunk, total = count,
                                monitor = index, width, height,
                                image = frame.Substring(offset, Math.Min(chunkLength, frame.Length - offset))
                            }, ct);
                        }
                        // Only one frame may be in flight. Without this, a slow
                        // phone connection builds a growing queue of old screens.
                        if (index == selectedMonitorIndex && approved && !ct.IsCancellationRequested)
                            await Task.WhenAny(acknowledgement.Task, Task.Delay(1500, ct));
                        if (ReferenceEquals(frameAcknowledgement, acknowledgement))
                            frameAcknowledgement = null;
                    }
                }
                await Task.Delay(70, ct);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { SetStatus("Screen capture error: " + ex.Message); }
    }

    private async Task StopHost()
    {
        var token = running;
        running = null;
        token?.Cancel();
        EndSession();
        connectionCode = null;
        browserReady = false;
        browserNavigationCompleted = false;
        browserLoadProblem = null;
        capturePageNavigationId = null;
        try { socket?.Abort(); socket?.Dispose(); } catch { }
        socket = null;
        codeLabel.Text = "Offline";
        status.Text = "Stopped";
        start.Enabled = true;
        stop.Enabled = false;
        endpoint.Enabled = true;
        secret.Enabled = true;
        mode.Enabled = true;
        // Revoke the old WebRTC capture and data channels by navigating away.
        if (browser?.CoreWebView2 != null) browser.CoreWebView2.Navigate("about:blank");
        await Task.CompletedTask;
    }
}
