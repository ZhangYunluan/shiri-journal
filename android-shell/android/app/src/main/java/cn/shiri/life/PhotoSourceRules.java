package cn.shiri.life;

/** Parse only the existing private queue's versioned MediaStore identities. No file paths. */
final class PhotoSourceRules {
 static final class Source {
  final String uri,version;final long generation;
  Source(String uri,String version,long generation){this.uri=uri;this.version=version;this.generation=generation;}
 }
 static Source parse(String key,String owner){
  try{
   if(key==null||!key.startsWith(owner+":"))return null;
   String value=key.substring(owner.length()+1);int at=value.indexOf('@'),gen=value.lastIndexOf(":g");
   if(at<0||gen<=at+1)return null;
   String uri=value.substring(0,at),version=value.substring(at+1,gen);long generation=Long.parseLong(value.substring(gen+2));
   if(!uri.matches("content://media/[a-zA-Z0-9_-]+/images/media/[0-9]+")||uri.contains("/internal/")||generation<=0||version.isEmpty())return null;
   return new Source(uri,version,generation);
  }catch(Exception e){return null;}
 }
}
