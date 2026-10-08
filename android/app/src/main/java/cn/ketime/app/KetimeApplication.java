package cn.ketime.app;

import android.app.Application;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import java.io.File;
import java.io.InputStream;
import java.io.FileOutputStream;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;

public final class KetimeApplication extends Application {
    public final CompletableFuture<String> ready = new CompletableFuture<>();
    @Override public void onCreate() {
        super.onCreate();
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                File web = new File(getFilesDir(), "web");
                if (!web.isDirectory() && !web.mkdirs()) throw new IllegalStateException("Cannot prepare web assets");
                for (String name : getAssets().list("web")) {
                    if (name.contains("/") || name.contains("\\")) throw new IllegalStateException("Invalid asset");
                    try(InputStream in = getAssets().open("web/"+name); FileOutputStream out = new FileOutputStream(new File(web,name))) {
                        byte[] buffer=new byte[8192];int count;while((count=in.read(buffer))!=-1)out.write(buffer,0,count);
                    }
                }
                if (!Python.isStarted()) Python.start(new AndroidPlatform(this));
                String url = Python.getInstance().getModule("android_runtime").callAttr("start", new File(getFilesDir(), "vault").getAbsolutePath(), web.getAbsolutePath(), new AndroidVault()).toString();
                ready.complete(url);
            } catch (Exception error) { if(BuildConfig.DEBUG)android.util.Log.e("KetimeStartup","Local initialization failed",error);ready.completeExceptionally(error); }
        });
    }
}
