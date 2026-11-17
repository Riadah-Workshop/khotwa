// Matches the parent-notification handoff: open on the user's click and fall
// back to the current tab when embedded browsers block a separate window.
export function openWhatsappMessage(phone:string,message:string,browser:Pick<Window,'open'|'location'>=window){
 const url='https://wa.me/'+phone+'?text='+encodeURIComponent(message);
 let popup:Window|null=null;
 try{popup=browser.open('about:blank','_blank');if(popup)popup.opener=null;}catch{popup=null;}
 if(popup){try{popup.location.href=url;return;}catch{try{popup.close();}catch{}}}
 browser.location.href=url;
}
