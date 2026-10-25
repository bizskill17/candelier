<?php
// Exercise upgrade using existing customer/order IDs and a legacy scheduled Lead.
$pdo->prepare("INSERT INTO leads(lead_no,lead_date,customer_type,customer_id,requirement,temperature,status,next_followup_date,next_followup_time,order_id,created_at,updated_at) VALUES ('LD-LEGACY',:d,'Existing',:c,'Legacy requirement','Cold','Open',:n,'14:30:00',:o,:t,:u)")->execute(['d'=>date('Y-m-d'),'c'=>$customer,'n'=>date('Y-m-d'),'o'=>$order,'t'=>date('Y-m-d').' 08:00:00','u'=>date('Y-m-d').' 09:00:00']);
$legacyLead=(int)$pdo->lastInsertId();
$pdo->prepare("INSERT INTO lead_followups(lead_id,followup_date,status,next_date,next_time,remarks) VALUES (:l,:d,'Follow Up Again',:n,'14:30:00','Legacy call')")->execute(['l'=>$legacyLead,'d'=>date('Y-m-d'),'n'=>date('Y-m-d')]);
