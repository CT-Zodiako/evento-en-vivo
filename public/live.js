// One shared Server-Sent Events connection for every live section of the page.
window.liveEvents = new EventSource('/api/events');
