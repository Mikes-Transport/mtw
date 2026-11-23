using System;
using System.IO;
using System.Windows.Forms;

namespace MTWStudio.Host;

internal static class Program
{
    private static readonly string LogPath = Path.Combine(
        AppContext.BaseDirectory, "MTWStudio.log");

    [STAThread]
    private static void Main()
    {
        try
        {
            WriteLog("Application starting.");
            ApplicationConfiguration.Initialize();
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (_, eventArgs) => Report(eventArgs.Exception);
            AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
                Report(eventArgs.ExceptionObject as Exception ??
                    new InvalidOperationException("Unhandled startup error"));
            var window = new HostWindow();
            window.Shown += (_, _) => WriteLog("Main window displayed.");
            Application.Run(window);
        }
        catch (Exception ex)
        {
            Report(ex);
        }
    }

    private static void WriteLog(string message)
    {
        try
        {
            File.AppendAllText(LogPath, $"[{DateTimeOffset.Now:O}] {message}\n");
        }
        catch { /* Running from a read-only folder must not prevent startup. */ }
    }

    private static void Report(Exception ex)
    {
        WriteLog(ex.ToString());
        try
        {
            MessageBox.Show("MTWStudio could not launch.\n\n" + ex.Message +
                "\n\nError details: " + LogPath,
                "MTWStudio startup error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch { /* Avoid recursive failures while reporting an exception. */ }
    }
}
