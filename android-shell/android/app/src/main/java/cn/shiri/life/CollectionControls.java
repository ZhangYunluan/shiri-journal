package cn.shiri.life;
/** Shared cancellation rule: pausing the clock must never cancel an explicit manual scan. */
final class CollectionControls {
 static boolean allowed(boolean automatic,boolean enabled,String owner,String active,boolean stopped){
  return !stopped&&(!automatic||(enabled&&owner.equals(active)));
 }
 static void checkRange(int days){if(days!=1&&days!=7)throw new IllegalArgumentException("请选择今天或最近七天");}
}
