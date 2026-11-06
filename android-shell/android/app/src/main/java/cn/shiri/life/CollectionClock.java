package cn.shiri.life;

import java.util.Calendar;
import java.util.Locale;

/** Calendar-based local wall time, independent of Android for unit testing. */
public final class CollectionClock {
    public static boolean valid(String time) { return time != null && time.matches("([01][0-9]|2[0-3]):[0-5][0-9]"); }
    public static long delay(long now, String time) {
        if (!valid(time)) throw new IllegalArgumentException("Invalid time");
        Calendar c=Calendar.getInstance(); c.setTimeInMillis(now);
        c.set(Calendar.HOUR_OF_DAY,Integer.parseInt(time.substring(0,2))); c.set(Calendar.MINUTE,Integer.parseInt(time.substring(3))); c.set(Calendar.SECOND,0); c.set(Calendar.MILLISECOND,0);
        if(c.getTimeInMillis()<=now)c.add(Calendar.DAY_OF_YEAR,1);
        return c.getTimeInMillis()-now;
    }
    public static long dayStart(long now){Calendar c=Calendar.getInstance();c.setTimeInMillis(now);c.set(Calendar.HOUR_OF_DAY,0);c.set(Calendar.MINUTE,0);c.set(Calendar.SECOND,0);c.set(Calendar.MILLISECOND,0);return c.getTimeInMillis();}
    public static String day(long now){Calendar c=Calendar.getInstance();c.setTimeInMillis(now);return String.format(Locale.ROOT,"%04d-%02d-%02d",c.get(Calendar.YEAR),c.get(Calendar.MONTH)+1,c.get(Calendar.DAY_OF_MONTH));}
    public static String time(long now){Calendar c=Calendar.getInstance();c.setTimeInMillis(now);return String.format(Locale.ROOT,"%02d:%02d",c.get(Calendar.HOUR_OF_DAY),c.get(Calendar.MINUTE));}
}
