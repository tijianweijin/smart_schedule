package cn.ketime.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import android.content.Context;
import android.content.Intent;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

@RunWith(AndroidJUnit4.class)
public class SmokeTest {
    private android.webkit.WebView findWeb(android.view.View view){
        if(view instanceof android.webkit.WebView)return (android.webkit.WebView)view;
        if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++){android.webkit.WebView found=findWeb(group.getChildAt(i));if(found!=null)return found;}}
        return null;
    }
    private String js(android.app.Activity activity,String script) throws Exception {
        java.util.concurrent.CountDownLatch done=new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.atomic.AtomicReference<String> value=new java.util.concurrent.atomic.AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            android.webkit.WebView web=findWeb(activity.getWindow().getDecorView());
            if(web==null){value.set("null");done.countDown();}else web.evaluateJavascript(script,result->{value.set(result);done.countDown();});
        });
        assertTrue(done.await(5,java.util.concurrent.TimeUnit.SECONDS));return value.get();
    }
    @Test public void webViewAndPersistence() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.app.Activity activity=InstrumentationRegistry.getInstrumentation().startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        long deadline=System.currentTimeMillis()+30000;String ready="null";
        while(System.currentTimeMillis()<deadline){ready=js(activity,"!!(window.__ketimeDemo&&window.KetimeAndroid&&window.KetimeAndroid.back&&window.__ketimeAndroidToken)");if("true".equals(ready))break;Thread.sleep(100);}
        assertEquals("true",ready);
        assertEquals("true",js(activity,"document.querySelectorAll('.view-tab').length===4&&document.getElementById('view-schedule').classList.contains('active')"));
        assertEquals("true",js(activity,"(()=>{const nav=document.querySelector('body>.android-bottom-nav'),rect=nav.getBoundingClientRect(),button=document.getElementById('add-event-btn'),add=button.getBoundingClientRect();return !document.querySelector('.app-nav .view-tabs')&&Math.abs(rect.bottom-innerHeight)<1&&Math.abs(add.left+add.width/2-innerWidth/2)<1&&add.width===48&&Math.abs(add.height-rect.height+1)<1&&getComputedStyle(button).borderRadius==='0px'&&nav.querySelectorAll('.view-tab').length===4})()"));
        assertEquals("true",js(activity,"document.getElementById('settings-btn').click();document.getElementById('view-settings').classList.contains('active')&&!document.getElementById('settings-overlay').classList.contains('overlay')&&window.KetimeAndroid.back()"));
        assertEquals("true",js(activity,"(()=>{const head=document.querySelector('.day-header-cell');return [...head.children].map(e=>e.className).join(',')==='day-date-label,day-num,day-name'&&getComputedStyle(document.getElementById('holiday-btn')).display==='none'&&!!document.getElementById('settings-holidays')})()"));
        assertEquals("true",js(activity,"(()=>{const wrap=document.getElementById('schedule-wrap'),cols=getComputedStyle(document.getElementById('schedule-grid')).gridTemplateColumns.split(' ').map(parseFloat);return Math.abs(cols[0]+cols[1]*3-wrap.clientWidth)<1})()"));
        assertEquals("true",js(activity,"getComputedStyle(document.getElementById('untimed-list')).gridTemplateColumns.split(' ').length===2"));
        assertEquals("true",js(activity,"document.getElementById('add-event-btn').click();document.getElementById('schedule-overlay').classList.contains('visible')&&window.KetimeAndroid.back()"));
        assertEquals("true",js(activity,"document.querySelector('[data-view=projects]').click();document.getElementById('view-projects').classList.contains('active')"));
        assertEquals("true",js(activity,"document.querySelector('[data-view=growth]').click();!!document.getElementById('growth-svg')"));
        assertEquals("true",js(activity,"localStorage.setItem('android-native-smoke','synthetic');localStorage.getItem('android-native-smoke')==='synthetic'"));
        assertEquals("true",js(activity,"localStorage.removeItem('android-native-smoke');document.querySelector('[data-view=schedule]').click();true"));
        com.chaquo.python.Python.getInstance().getModule("cryptography.hazmat.primitives.asymmetric.rsa").callAttr("generate_private_key",65537,2048);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
    }
    @Test public void serverAndKeystore() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        String url=((KetimeApplication)context.getApplicationContext()).ready.get(90,java.util.concurrent.TimeUnit.SECONDS);
        assertEquals("http://127.0.0.1:8766/",url);
        HttpURLConnection config=(HttpURLConnection)new URL(url+"api/config").openConnection();
        config.setConnectTimeout(10000);config.setReadTimeout(10000);assertEquals(200,config.getResponseCode());
        java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int length;try(java.io.InputStream in=config.getInputStream()){while((length=in.read(buffer))!=-1)output.write(buffer,0,length);}
        JSONObject data=new JSONObject(new String(output.toByteArray(),StandardCharsets.UTF_8));assertEquals("android",data.getString("platform"));assertTrue(data.getBoolean("modelSettings"));assertTrue(data.getBoolean("scheduleAssistant"));
        HttpURLConnection stylesheet=(HttpURLConnection)new URL(url+"android-mobile.css").openConnection();assertEquals(200,stylesheet.getResponseCode());assertTrue(stylesheet.getContentType().startsWith("text/css"));stylesheet.disconnect();
        AndroidVault vault=new AndroidVault();String text=android.util.Base64.encodeToString("synthetic-test-only".getBytes(StandardCharsets.UTF_8),android.util.Base64.NO_WRAP);
        String a=vault.encryptBase64(text),b=vault.encryptBase64(text);assertNotEquals(a,b);assertEquals(text,vault.decryptBase64(a));
        byte[] damaged=android.util.Base64.decode(a,android.util.Base64.NO_WRAP);damaged[damaged.length-1]^=1;
        try{vault.decryptBase64(android.util.Base64.encodeToString(damaged,android.util.Base64.NO_WRAP));fail("Tampering must fail");}catch(javax.crypto.AEADBadTagException expected){}
        HttpURLConnection forbidden=(HttpURLConnection)new URL(url+"vault/chatgpt.aes").openConnection();assertEquals(404,forbidden.getResponseCode());
    }
}
