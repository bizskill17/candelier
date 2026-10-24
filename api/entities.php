<?php
// Simple masters handled by the generic engine (handlers/masters.php).
// Materials have their own handler (handlers/materials.php) because of their specification fields.
// No rate/price fields anywhere.
//
// Field rule keys: type (text|textarea|phone|enum|username|password), required, max, options, unique

function entities(): array
{
    $party = [
        'name'           => ['label' => 'Name', 'type' => 'text', 'required' => true, 'max' => 150],
        'contact_person' => ['label' => 'Contact person', 'type' => 'text', 'max' => 100],
        'phone'          => ['label' => 'Phone', 'type' => 'phone'],
        'city'           => ['label' => 'City', 'type' => 'text', 'max' => 80],
        'address'        => ['label' => 'Address', 'type' => 'textarea', 'max' => 255],
    ];
    return [
        'material_categories' => [
            'label' => 'Material Category', 'table' => 'material_categories', 'prefix' => 'MC',
            'fields' => ['name' => ['label' => 'Name', 'type' => 'text', 'required' => true, 'max' => 100, 'unique' => true]],
            'search' => ['code', 'name'],
            'referenced_by' => [['table' => 'materials', 'column' => 'category_id', 'label' => 'material']],
        ],
        'customers' => [
            'label' => 'Customer', 'table' => 'customers', 'prefix' => 'CUS',
            'fields' => [
                'name'           => ['label' => 'Name', 'type' => 'text', 'required' => true, 'max' => 150],
                'category_id'    => ['label' => 'Client category', 'type' => 'fk', 'ref' => 'client_categories'],
                'phone'          => ['label' => 'Phone', 'type' => 'mobile'],
                'email'          => ['label' => 'Email', 'type' => 'email', 'max' => 150],
                'contact_person' => ['label' => 'Contact person', 'type' => 'text', 'max' => 100],
                'contact_mobile' => ['label' => 'Contact person mobile', 'type' => 'mobile'],
                'city'           => ['label' => 'City', 'type' => 'text', 'max' => 80],
                'state_id'       => ['label' => 'State', 'type' => 'fk', 'ref' => 'states'],
                'address'        => ['label' => 'Address', 'type' => 'textarea', 'max' => 255],
            ],
            'joins' => ['state_id' => ['table' => 'states', 'as' => 'state_name'], 'category_id' => ['table' => 'client_categories', 'as' => 'category_name']],
            'search' => ['code', 'name', 'contact_person', 'phone', 'city', 'email', 'contact_mobile', 'address'],
            'text_filters' => ['city'],
            'referenced_by' => [['table' => 'orders', 'column' => 'customer_id', 'label' => 'order'], ['table' => 'leads', 'column' => 'customer_id', 'label' => 'lead']],
            'lookup' => ['address', 'phone', 'city', 'email', 'contact_person', 'contact_mobile', 'state_id', 'category_id'],
        ],
        'suppliers' => [
            'label' => 'Supplier', 'table' => 'suppliers', 'prefix' => 'SUP',
            'fields' => $party,
            'search' => ['code', 'name', 'contact_person', 'phone', 'city'],
            'referenced_by' => [['table' => 'material_receipts', 'column' => 'supplier_id', 'label' => 'material receipt']],
        ],
        'transporters' => [
            'label' => 'Transporter', 'table' => 'transporters', 'prefix' => 'TRN',
            'fields' => [
                'name'  => ['label' => 'Name', 'type' => 'text', 'required' => true, 'max' => 100],
                'phone' => ['label' => 'Phone', 'type' => 'phone'],
            ],
            'search' => ['code', 'name', 'phone'],
            'referenced_by' => [['table' => 'dispatches', 'column' => 'transporter_id', 'label' => 'dispatch']],
        ],
        'states' => [
            'label' => 'State', 'table' => 'states', 'prefix' => 'ST',
            'fields' => ['name' => ['label' => 'Name', 'type' => 'text', 'required' => true, 'max' => 60, 'unique' => true]],
            'search' => ['code', 'name'],
            'referenced_by' => [['table' => 'leads', 'column' => 'state_id', 'label' => 'lead'], ['table' => 'customers', 'column' => 'state_id', 'label' => 'customer']],
        ],
        'client_categories' => [
            'label' => 'Client Category', 'table' => 'client_categories', 'prefix' => 'CC',
            'fields' => ['name' => ['label' => 'Name', 'type' => 'text', 'required' => true, 'max' => 60, 'unique' => true]],
            'search' => ['code', 'name'],
            'referenced_by' => [['table' => 'customers', 'column' => 'category_id', 'label' => 'customer']],
        ],
        'lead_sources' => [
            'label' => 'Lead Source', 'table' => 'lead_sources', 'prefix' => 'SRC',
            'fields' => ['name' => ['label' => 'Name', 'type' => 'text', 'required' => true, 'max' => 60, 'unique' => true]],
            'search' => ['code', 'name'],
            'referenced_by' => [['table' => 'leads', 'column' => 'source_id', 'label' => 'lead']],
        ],
        'users' => [
            'label' => 'User', 'table' => 'users', 'prefix' => 'USR',
            'admin_only' => true,
            'guard' => 'users_guard',
            'fields' => [
                'name'     => ['label' => 'Name', 'type' => 'text', 'required' => true, 'max' => 100],
                'username' => ['label' => 'Username', 'type' => 'username', 'required' => true, 'unique' => true],
                'password' => ['label' => 'Password', 'type' => 'password'],
                'role'     => ['label' => 'Role', 'type' => 'enum', 'required' => true, 'options' => ['Admin', 'Staff', 'Viewer']],
                'phone'    => ['label' => 'Phone', 'type' => 'phone'],
            ],
            'search' => ['code', 'name', 'username', 'role'],
            'referenced_by' => [
                ['table' => 'orders', 'column' => 'order_by_id', 'label' => 'order'],
                ['table' => 'bookings', 'column' => 'booked_by', 'label' => 'booking'],
                ['table' => 'lead_followups', 'column' => 'followup_by', 'label' => 'follow-up'],
            ],
        ],
    ];
}

function entity(string $key): array
{
    $all = entities();
    if (!isset($all[$key])) {
        throw new ApiError("Unknown master \"$key\".", 404);
    }
    return $all[$key] + ['key' => $key];
}
