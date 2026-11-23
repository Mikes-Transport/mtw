using System.Net.Http.Headers;
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
    private readonly TextBox endpoint = new() { Text = "https://", Width = 390 };
    private readonly TextBox secret = new() { Width = 390, UseSystemPasswordChar = true };
    private readonly ComboBox mode = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 260 };
    private readonly Label codeLabel = new() { Text = "Not connected", AutoSize = true, Font = new Font("Segoe UI", 17, FontStyle.Bold) };
    private readonly Label status = new() { Text = "Offline", AutoSize = true };
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
    private bool captureReady;
    private bool approved;
    private bool browserReady;
    private readonly string appData = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MTWStudio");
    private readonly string configPath;
    private string? activeSession;

    public HostWindow()
    {
        configPath = Path.Combine(appData, "host-settings.json");
        Text = "MTWStudio Host — Portable Remote Support";
        Size = new Size(780, 760);
        MinimumSize = new Size(650, 600);
        BackColor = Color.FromArgb(16, 24, 39);
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 10);

        mode.Items.AddRange(new object[] { "Connection code required", "Allow connections while open" });
        mode.SelectedIndex = 0;
        var head = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(20), ColumnCount = 2 };
        head.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 185));
        head.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        AddRow(head, "MTWStudio server", endpoint);
        AddRow(head, "Host access key", secret);
        AddRow(head, "Connection mode", mode);
        AddRow(head, "This computer's code", codeLabel);
        AddRow(head, "Current status", status);
        var controls = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill };
        controls.Controls.Add(start);
        controls.Controls.Add(stop);
        AddRow(head, "", controls);
        browserHolder.Controls.Add(new Label {
            Text = "MTWStudio Host\\n\\nEnter your server details and press Start host.\\nScreen sharing starts only after you choose a display.",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Color.LightSteelBlue
        });
        Controls.Add(browserHolder);
        Controls.Add(head);
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = true;
        WindowState = FormWindowState.Normal;
        Shown += (_, _) => { Activate(); BringToFront(); };

        start.Click += async (_, _) => await StartHost();
        stop.Click += async (_, _) => await StopHost();
        FormClosing += (_, _) => {
            running?.Cancel();
            try { socket?.Abort(); } catch { }
            browser?.Dispose();
        };
        LoadSettings();
    }

    private static void AddRow(TableLayoutPanel panel, string label, Control control)
    {
        var row = panel.RowCount++;
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        var caption = new Label { Text = label, AutoSize = true, Padding = new Padding(0, 8, 0, 0), ForeColor = Color.LightSteelBlue };
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
            if (root.TryGetProperty("endpoint", out var saved)) endpoint.Text = saved.GetString() ?? "https://";
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

    private async Task<JsonElement> Request(string path, HttpMethod method, object? payload, CancellationToken ct)
    {
        if (baseUri is null) throw new InvalidOperationException("Server is not configured");
        using var req = new HttpRequestMessage(method, new Uri(baseUri, path));
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secret.Text.Trim());
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
            if (!System.Text.RegularExpressions.Regex.IsMatch(secret.Text.Trim(), "^[a-f0-9]{64}$"))
                throw new InvalidOperationException("Enter the 64-character host access key.");
            baseUri = uri;
            SaveSettings();
            running = new CancellationTokenSource();
            captureReady = false;
            approved = false;
            activeSession = null;
            browserReady = false;
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
            browser.CoreWebView2.Settings.IsWebMessageEnabled = true;
            browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.AreHostObjectsAllowed = false;
            browser.CoreWebView2.WebMessageReceived -= BrowserMessage;
            browser.CoreWebView2.WebMessageReceived += BrowserMessage;
            browser.CoreWebView2.NavigationStarting += (_, args) =>
            {
                if (baseUri == null || (args.Uri != "about:blank" && args.Uri != new Uri(baseUri, "/host.html").AbsoluteUri))
                    args.Cancel = true;
            };
            browser.Source = new Uri(baseUri, "/host.html");
            stop.Enabled = true;
            endpoint.Enabled = false;
            secret.Enabled = false;
            mode.Enabled = false;

            socket = new ClientWebSocket();
            socket.Options.SetRequestHeader("Authorization", "Bearer " + secret.Text.Trim());
            var wsUri = new UriBuilder(new Uri(baseUri, "/api/agent/ws?code=" + connectionCode)) { Scheme = "wss", Port = -1 }.Uri;
            await socket.ConnectAsync(wsUri, running.Token);
            SetStatus("Online · select screen to share before approving access");
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
        if (!captureReady || !browserReady)
        {
            MessageBox.Show(this, "Select a screen in the MTWStudio Host window before approving a connection.",
                "Screen sharing required", MessageBoxButtons.OK, MessageBoxIcon.Information);
            await Send(new { type = "reject" }, ct);
            return;
        }
        var answer = MessageBox.Show(this,
            name + " has requested control of this computer. Allow viewing, mouse clicks and keyboard input?\n\n" +
            "You can stop the session at any time.", "Approve MTWStudio connection?",
            MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
        if (answer != DialogResult.Yes)
        {
            await Send(new { type = "reject" }, ct);
            return;
        }
        activeSession = id;
        approved = true;
        SetStatus("Remote session active · " + name + " · press Disconnect to stop");
        await Send(new { type = "approve" }, ct);
        PostBrowser(JsonSerializer.Serialize(new { type = "approved" }));
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
        if (baseUri == null || args.Source != new Uri(baseUri, "/host.html").AbsoluteUri) return;
        try
        {
            using var doc = JsonDocument.Parse(args.WebMessageAsJson);
            var root = doc.RootElement;
            var type = root.GetProperty("type").GetString();
            if (type == "host-web-ready") { browserReady = true; return; }
            if (type == "capture-ready") { captureReady = true; return; }
            if (type == "capture-ended") { captureReady = false; if (approved) await StopHost(); return; }
            if (!approved || !captureReady || running == null || activeSession == null) return;
            if (type is "offer" or "ice" or "peer-failed")
            {
                if (type == "peer-failed") { await StopHost(); return; }
                await Send(new { type, data = root.GetProperty("data").Clone() }, running.Token);
            }
            else if (type == "input") RemoteInput.Apply(root.GetProperty("data"));
        }
        catch (Exception ex) { SetStatus("Host input error: " + ex.Message); }
    }

    private void EndSession()
    {
        approved = false;
        activeSession = null;
        PostBrowser(JsonSerializer.Serialize(new { type = "stop" }));
        SetStatus("Online · waiting for another approved connection");
    }

    private async Task StopHost()
    {
        var token = running;
        running = null;
        token?.Cancel();
        EndSession();
        captureReady = false;
        connectionCode = null;
        browserReady = false;
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
