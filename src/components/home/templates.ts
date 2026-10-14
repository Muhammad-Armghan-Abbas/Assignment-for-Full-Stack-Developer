/** Starter templates offered on the documents page. Plain editor HTML. */
export const TEMPLATES = [
  {
    id: "blank",
    name: "Blank document",
    title: "Untitled document",
    html: "",
  },
  {
    id: "meeting",
    name: "Meeting notes",
    title: "Meeting notes",
    html: `<h1>Meeting notes</h1><p><strong>Date:</strong> <br><strong>Attendees:</strong> </p><h2>Agenda</h2><ol><li><p></p></li></ol><h2>Notes</h2><p></p><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>`,
  },
  {
    id: "brief",
    name: "Project brief",
    title: "Project brief",
    html: `<h1>Project brief</h1><table><tbody><tr><th><p>Owner</p></th><td><p></p></td></tr><tr><th><p>Status</p></th><td><p>Draft</p></td></tr><tr><th><p>Target date</p></th><td><p></p></td></tr></tbody></table><h2>Problem</h2><p></p><h2>Goals</h2><ul><li><p></p></li></ul><h2>Non-goals</h2><ul><li><p></p></li></ul><h2>Plan</h2><p></p>`,
  },
  {
    id: "retro",
    name: "Retrospective",
    title: "Sprint retrospective",
    html: `<h1>Sprint retrospective</h1><h2>What went well</h2><ul><li><p></p></li></ul><h2>What could be better</h2><ul><li><p></p></li></ul><h2>Experiments for next sprint</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>`,
  },
] as const;
