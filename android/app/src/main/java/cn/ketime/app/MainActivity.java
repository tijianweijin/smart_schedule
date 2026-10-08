package cn.ketime.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import android.util.Base64;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int OPEN_BACKUP=10, SAVE_BACKUP=11;
    private static final String ORIGIN="http://127.0.0.1:8766";
    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private byte[] pendingExport;
    private volatile boolean trustedPage=false;
    private final String bridgeToken=token();
    private static String token(){byte[] data=new byte[32];new SecureRandom().nextBytes(data);return Base64.encodeToString(data,Base64.NO_WRAP);}

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(247,246,243));setContentView(root);
        root.setOnApplyWindowInsetsListener((view,insets)->{
            if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);}
            else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        TextView loading=new TextView(this);loading.setText("刻时 1.0\n正在准备本机日程与服务…");loading.setTextColor(Color.rgb(40,121,75));loading.setTextSize(20);loading.setGravity(android.view.Gravity.CENTER);root.addView(loading,new FrameLayout.LayoutParams(-1,-1));
        ((KetimeApplication)getApplication()).ready.whenComplete((url,error)->runOnUiThread(()->{
            if(isFinishing()||isDestroyed())return;
            if(error!=null){loading.setText("刻时启动失败。请关闭并重新打开应用。\n若本机端口被其他应用占用，请先关闭该应用。\n原日程和凭据未删除。");return;}
            root.removeView(loading);setupWeb(root,url);
        }));
    }
    private void setupWeb(FrameLayout root,String url){
        web=new WebView(this);web.setBackgroundColor(Color.rgb(247,246,243));root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(true);settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSafeBrowsingEnabled(true);settings.setMediaPlaybackRequiresUserGesture(true);
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.addJavascriptInterface(new BackupBridge(),"KetimeNative");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(isLocal(request.getUrl()))return false;
                if(request.isForMainFrame())openExternal(request.getUrl());return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();if(isLocal(uri)||"data".equals(uri.getScheme())||"blob".equals(uri.getScheme()))return null;
                return new WebResourceResponse("text/plain","utf-8",403,"Blocked",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageStarted(WebView view,String address,android.graphics.Bitmap icon){trustedPage=false;}
            @Override public void onPageFinished(WebView view,String address){
                trustedPage=isLocal(Uri.parse(address));
                if(trustedPage)web.evaluateJavascript("window.__ketimeAndroidToken="+JSONObject.quote(bridgeToken)+";",null);
            }
            @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsAlert(WebView view,String url,String text,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(text).setPositiveButton("确定",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onJsConfirm(WebView view,String url,String text,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(text).setPositiveButton("确定",(d,w)->result.confirm()).setNegativeButton("取消",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(!trustedPage)return false;if(chooser!=null)chooser.onReceiveValue(null);chooser=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                try{startActivityForResult(intent,OPEN_BACKUP);}catch(ActivityNotFoundException e){chooser.onReceiveValue(null);chooser=null;notice("手机没有可用的文件选择器。");}return true;
            }
            @Override public boolean onCreateWindow(WebView view,boolean dialog,boolean userGesture,Message message){
                if(!trustedPage||!userGesture)return false;
                WebView popup=new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){openExternal(request.getUrl());v.destroy();return true;}});
                ((WebView.WebViewTransport)message.obj).setWebView(popup);message.sendToTarget();return true;
            }
        });
        web.loadUrl(url);
    }
    private static boolean isLocal(Uri uri){return "http".equals(uri.getScheme())&&"127.0.0.1".equals(uri.getHost())&&uri.getPort()==8766&&uri.getUserInfo()==null;}
    private void openExternal(Uri uri){
        if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null){notice("已阻止不安全的外部链接。");return;}
        try{startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE));}catch(ActivityNotFoundException e){notice("请安装系统浏览器后重试。");}
    }
    private void notice(String text){runOnUiThread(()->Toast.makeText(this,text,Toast.LENGTH_LONG).show());}
    public final class BackupBridge {
        private boolean allowed(String token){return trustedPage&&bridgeToken.equals(token);}
        @JavascriptInterface public void openAuth(String token,String address){
            if(!allowed(token)||address==null||address.length()>16384)return;
            Uri uri=Uri.parse(address);if(!"https".equals(uri.getScheme())||!"auth.openai.com".equals(uri.getHost())||!"/api/accounts/authorize".equals(uri.getPath())||uri.getUserInfo()!=null)return;
            runOnUiThread(()->openExternal(uri));
        }
        @JavascriptInterface public void exportBackup(String token,String json,String name){
            if(!allowed(token)||json==null||json.length()>10*1024*1024)return;
            try{JSONObject data=new JSONObject(json);if(!data.has("schedules")||!data.has("projects")||!data.has("growth"))return;}catch(Exception e){return;}
            runOnUiThread(()->{
                if(pendingExport!=null){notice("请先完成当前备份保存。");return;}
                pendingExport=json.getBytes(StandardCharsets.UTF_8);
                if(pendingExport.length>10*1024*1024){pendingExport=null;notice("备份超过10MB。");return;}
                String filename=name!=null&&name.matches("ketime-backup-[0-9-]+\\.json")?name:"ketime-backup.json";
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,filename);
                try{startActivityForResult(intent,SAVE_BACKUP);}catch(ActivityNotFoundException e){pendingExport=null;notice("手机没有可用的文件保存器。");}
            });
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==OPEN_BACKUP&&chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);chooser=null;}
        if(request==SAVE_BACKUP){byte[] bytes=pendingExport;pendingExport=null;if(result==RESULT_OK&&data!=null&&data.getData()!=null&&bytes!=null){
            java.util.concurrent.Executors.newSingleThreadExecutor().execute(()->{try(OutputStream out=getContentResolver().openOutputStream(data.getData(),"wt")){if(out==null)throw new IllegalStateException();out.write(bytes);notice("备份已保存。");}catch(Exception e){notice("备份保存失败，原数据未更改。");}finally{java.util.Arrays.fill(bytes,(byte)0);}});
        }else if(bytes!=null)java.util.Arrays.fill(bytes,(byte)0);}
    }
    @Override public void onBackPressed(){
        if(web==null){super.onBackPressed();return;}
        web.evaluateJavascript("window.KetimeAndroid&&window.KetimeAndroid.back?window.KetimeAndroid.back():false",result->{if(!"true".equals(result))new AlertDialog.Builder(this).setMessage("退出刻时？数据已保存在手机。") .setPositiveButton("退出",(d,w)->finish()).setNegativeButton("取消",null).show();});
    }
    @Override protected void onResume(){super.onResume();if(web!=null){web.onResume();web.evaluateJavascript("window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));",null);}}
    @Override protected void onPause(){if(web!=null)web.onPause();super.onPause();}
    @Override protected void onDestroy(){if(chooser!=null)chooser.onReceiveValue(null);if(web!=null){trustedPage=false;web.removeJavascriptInterface("KetimeNative");web.destroy();}super.onDestroy();}
}
