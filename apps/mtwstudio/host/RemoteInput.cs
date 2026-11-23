using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

namespace MTWStudio.Host;

// Injects only validated input events after native host consent.
// Windows secure desktops (including UAC) are intentionally not supported.
internal static class RemoteInput
{
    private const uint LeftDown = 0x0002, LeftUp = 0x0004, RightDown = 0x0008, RightUp = 0x0010;
    private const uint MiddleDown = 0x0020, MiddleUp = 0x0040, Wheel = 0x0800;
    private const uint KeyUp = 0x0002;

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
    [DllImport("user32.dll")]
    private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extraInfo);

    public static void Apply(JsonElement input)
    {
        if (input.ValueKind != JsonValueKind.Object ||
            !input.TryGetProperty("type", out var typeField) || typeField.ValueKind != JsonValueKind.String)
            return;
        var type = typeField.GetString();
        if (type is "mouseMove" or "mouseDown" or "mouseUp")
        {
            if (!TryUnit(input, "x", out var x) || !TryUnit(input, "y", out var y)) return;
            // Control primary display only. Match captured primary monitor for accurate coordinates.
            var screen = Screen.PrimaryScreen;
            if (screen == null) return;
            var bounds = screen.Bounds;
            SetCursorPos(bounds.Left + (int)Math.Round(x * (bounds.Width - 1)),
                         bounds.Top + (int)Math.Round(y * (bounds.Height - 1)));
            if (type == "mouseMove") return;
            if (!input.TryGetProperty("button", out var button) || !button.TryGetInt32(out var b)) return;
            uint flags = (type, b) switch
            {
                ("mouseDown", 0) => LeftDown,
                ("mouseUp", 0) => LeftUp,
                ("mouseDown", 2) => RightDown,
                ("mouseUp", 2) => RightUp,
                ("mouseDown", 1) => MiddleDown,
                ("mouseUp", 1) => MiddleUp,
                _ => 0
            };
            if (flags != 0) mouse_event(flags, 0, 0, 0, UIntPtr.Zero);
        }
        else if (type == "scroll")
        {
            if (!TryNumber(input, "dy", out var dy)) return;
            var ticks = Math.Clamp((int)-dy, -960, 960);
            mouse_event(Wheel, 0, 0, unchecked((uint)ticks), UIntPtr.Zero);
        }
        else if (type is "keyDown" or "keyUp")
        {
            if (!input.TryGetProperty("code", out var codeField) ||
                codeField.ValueKind != JsonValueKind.String) return;
            var code = codeField.GetString() ?? "";
            if (!TryKey(code, out var key)) return;
            keybd_event((byte)key, 0, type == "keyUp" ? KeyUp : 0, UIntPtr.Zero);
        }
    }

    private static bool TryNumber(JsonElement obj, string key, out double value)
    {
        value = 0;
        return obj.TryGetProperty(key, out var field) &&
               field.ValueKind == JsonValueKind.Number &&
               field.TryGetDouble(out value) && double.IsFinite(value);
    }

    private static bool TryUnit(JsonElement obj, string key, out double value) =>
        TryNumber(obj, key, out value) && value >= 0 && value <= 1;

    private static bool TryKey(string code, out Keys key)
    {
        key = Keys.None;
        if (code.Length == 4 && code.StartsWith("Key") && code[3] is >= 'A' and <= 'Z')
            return Enum.TryParse(code[3].ToString(), out key);
        if (code.Length == 6 && code.StartsWith("Digit") && code[5] is >= '0' and <= '9')
            return Enum.TryParse("D" + code[5], out key);
        var name = code switch
        {
            "Enter" => "Return", "Escape" => "Escape", "Backspace" => "Back",
            "Space" => "Space", "Tab" => "Tab",
            "ArrowLeft" => "Left", "ArrowRight" => "Right", "ArrowUp" => "Up", "ArrowDown" => "Down",
            "Delete" => "Delete", "Insert" => "Insert", "Home" => "Home", "End" => "End",
            "PageUp" => "PageUp", "PageDown" => "PageDown",
            "ControlLeft" or "ControlRight" => "ControlKey",
            "ShiftLeft" or "ShiftRight" => "ShiftKey",
            "AltLeft" or "AltRight" => "Menu",
            "MetaLeft" or "MetaRight" => "LWin",
            "Minus" => "OemMinus", "Equal" => "Oemplus",
            "BracketLeft" => "OemOpenBrackets", "BracketRight" => "Oem6",
            "Backslash" => "Oem5", "Semicolon" => "Oem1",
            "Quote" => "Oem7", "Comma" => "Oemcomma", "Period" => "OemPeriod",
            "Slash" => "OemQuestion", "Backquote" => "Oemtilde",
            _ => code.StartsWith('F') && code.Length <= 3 ? code : ""
        };
        return name.Length > 0 && Enum.TryParse(name, true, out key) && (int)key is > 0 and <= 255;
    }
}
