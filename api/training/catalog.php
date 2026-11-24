<?php
// S = Sales, T = Store. Admin can see every published lesson.
return [
    'Getting Started' => [
        ['Sign in and use the left menu', 'Sign in', 'Open the left menu and find the signed-in account at the bottom.', 'ST'],
        ['Understand dashboard counts and work queues', 'Dashboard', 'Open the relevant queue and check its filters and record count.', 'ST'],
    ],
    'Enquiries' => [
        ['Review an enquiry', 'Enquiries → Enquiry Inbox', 'Check the contact details and original requirement.', 'S'],
        ['Schedule an enquiry follow-up', 'Enquiries → Enquiry Inbox', 'Choose Follow up Later and verify the next date and time.', 'S'],
        ['Keep an enquiry as a Contact', 'Enquiries → Enquiry Inbox', 'Choose Keep as Contact and reuse a match when available.', 'S'],
        ['Convert an enquiry into a Lead', 'Enquiries → Enquiry Inbox', 'Choose Create Lead and verify the linked Contact and Lead.', 'S'],
        ['Archive an enquiry', 'Enquiries → Enquiry Inbox', 'Enter the archive reason and verify the archived entry.', 'S'],
    ],
    'Contacts & Customers' => [
        ['Add a Contact', 'Contacts → All Contacts', 'Search for an existing Contact before saving.', 'S'],
        ['Edit a Contact', 'Contacts → All Contacts', 'Open the saved Contact and verify the revised details.', ''],
        ['Import Contacts from CSV', 'Contacts → All Contacts', 'Use the template, review the preview and verify imported rows.', 'S'],
        ['Record a Contact follow-up', 'Contacts → All Contacts', 'Verify the remarks and next date in the follow-up history.', 'S'],
        ['Understand Contacts and Customers', 'Orders → Customers', 'A Contact with a non-cancelled order appears in Customers.', 'ST'],
    ],
    'Leads' => [
        ['Add a Lead', 'Leads → Add Lead', 'Select the existing Contact, enter the requirement and verify the new record in All Leads.', 'S'],
        ['Edit a Lead', 'Leads → All Leads', 'Open Edit for the intended Lead and verify the saved changes.', ''],
        ['Record a Lead follow-up', 'Leads → All Leads', 'Use the follow-up icon and verify the saved entry in History.', 'S'],
        ['Set priority and next follow-up', 'Leads → Lead Follow-ups', 'Choose Hot, Warm or Cold and verify the next follow-up date.', 'S'],
        ['Mark a Lead as Success or Fail', 'Leads → All Leads', 'Record the outcome and verify the Lead status.', 'S'],
        ['View Lead follow-up history', 'Leads → All Leads', 'Open the history icon on the correct Lead.', 'S'],
    ],
    'WhatsApp' => [
        ['Create a WhatsApp campaign', 'Contacts → All Contacts', 'Select the intended Contacts and review the template before sending.', 'S'],
        ['Check campaign results', 'WhatsApp → WhatsApp Campaigns', 'Open the campaign and review delivery results.', 'S'],
        ['Review failed Contacts', 'WhatsApp → Failed Contacts', 'Check the latest status before retargeting.', 'S'],
    ],
    'Orders' => [
        ['Add an Order with multiple items', 'Orders → Add Order', 'Verify the Contact and all item lines in Order Master.', 'S'],
        ['Find an Order in Order Master', 'Orders → Order Master', 'Search by Order number and verify the item line.', 'ST'],
        ['Assign or reassign an Order', 'Orders → Order Master', 'Select an active salesperson and verify the assignment.', ''],
        ['Edit or cancel an Order', 'Orders → Order Master', 'Check the item and dispatch status before correcting the Order.', ''],
    ],
    'Drawing & BOQ' => [
        ['Upload a drawing against an order item', 'BOQ → Pending Drawing', 'Verify the uploaded file on the exact item line.', 'ST'],
        ['Create a Draft BOQ', 'BOQ → Pending BOQ', 'Select each material and quantity, then confirm Draft status.', 'S'],
        ['Finalise a BOQ', 'BOQ → Pending BOQ', 'Verify the drawing, materials, quantities and Final status.', 'S'],
        ['Correct a Final BOQ', 'BOQ → Orders with BOQ', 'Check prior issues and bookings before changing quantities.', ''],
        ['Find items pending material issue', 'Issue → Pending Material Issue', 'Check the remaining quantities for the exact item line.', 'ST'],
    ],
    'Purchase & Inventory' => [
        ['Add a Material Category', 'Purchase → Material Categories', 'Verify that the new category can be selected for materials.', 'T'],
        ['Add a Material and photo', 'Purchase → Materials', 'Verify the unique code, category, unit and photo.', 'T'],
        ['Import Materials from CSV', 'Purchase → Materials', 'Use existing categories and review validation before saving.', 'T'],
        ['Enter Opening Stock', 'Purchase → Opening Stock', 'Match counted quantity and unit to the material code.', 'T'],
        ['Record a purchase receipt', 'Purchase → Material In', 'Record the supplier, date, reference and quantities received.', 'T'],
        ['Check Inventory', 'Stores → Inventory', 'Verify the balance for the correct material code and unit.', 'ST'],
        ['Record Damage', 'Issue → Damage', 'Verify the quantity, reason and resulting stock movement.', 'T'],
    ],
    'Material & Sample Issue' => [
        ['Issue material against a Final BOQ', 'Issue → Pending Material Issue', 'Save actual issued quantities against the exact order item.', 'T'],
        ['Record a partial issue', 'Issue → Pending Material Issue', 'Verify the saved issue and the quantity still pending.', 'T'],
        ['Check remaining issue quantities', 'Issue → Pending Material Issue', 'Compare the outstanding requirement with available stock.', 'ST'],
        ['Receive sample stock', 'Purchase → Material In', 'Choose Sample and verify the receipt in Sample Inventory.', 'T'],
        ['Issue a sample and verify BOQ impact', 'Stores → Sample Inventory', 'Check Counts toward BOQ in Sample Issue History.', 'T'],
    ],
    'Production & Dispatch' => [
        ['Find an item in Production In Progress', 'Production → Production In Progress', 'Search by Order number and verify the line after the first issue.', 'T'],
        ['Mark production complete', 'Production → Production In Progress', 'Select Complete, click Update and verify Ready to Dispatch.', 'T'],
        ['Dispatch an order item', 'Dispatch → Ready to Dispatch', 'Record actual shipment details against the intended line.', 'T'],
        ['Verify dispatched items', 'Dispatch → Orders Dispatched', 'Check the saved shipment and item reference.', 'ST'],
        ['Correct or reverse a dispatch', 'Dispatch → Orders Dispatched', 'Verify the resulting dispatch and production queue state.', ''],
    ],
    'Administration' => [
        ['Create a user and assign a role', 'Administration → Users', 'Verify the assigned role and account status.', ''],
        ['Configure Google Sheets enquiries', 'Enquiries → Google Sheets Connection', 'Verify the connection and review the first sync.', ''],
        ['Review enquiry sync history', 'Enquiries → Sync History', 'Check the imported rows and investigate any failed run.', 'S'],
        ['Configure Red Lava', 'WhatsApp → Red Lava Settings', 'Verify integration settings without exposing credentials in the recording.', ''],
    ],
    'Complete Workflow' => [
        ['Enquiry to confirmed Order', 'Enquiries → Enquiry Inbox', 'Use one Contact across the enquiry, Lead and Order.', 'S'],
        ['Drawing to Final BOQ', 'BOQ → Pending Drawing', 'Follow one Order item through drawing upload and finalisation.', 'ST'],
        ['Material Issue to Dispatch', 'Issue → Pending Material Issue', 'Trace an issued item through production and dispatch.', 'ST'],
        ['Complete workflow from Enquiry to Dispatch', 'Enquiries → Enquiry Inbox', 'Use the same Order number and item line at each handoff.', 'ST'],
    ],
];
