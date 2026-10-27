<?php
// Authorisation is enforced on the server, independently of menu/button visibility.
function app_role(): string { return current_user()['role'] ?? ''; }
function require_roles(array $roles): void { if(!in_array(app_role(),$roles,true))throw new ApiError('You do not have permission for this action.',403); }
function require_admin(): void { require_roles(['Admin']); }
function order_visibility_sql(string $alias='o'): string {
    return match(app_role()) { 'Admin','Store'=>'1=1', 'Sales'=>"$alias.assigned_salesperson_id=".(int)current_user()['id'], default=>'1=0' };
}
function require_order_access(int $id): void {
    if(!db_value('SELECT COUNT(*) FROM orders o WHERE o.id=:id AND '.order_visibility_sql(),['id'=>$id]))throw new ApiError('Order not found or not assigned to you.',404);
}
function require_item_access(int $id): void {
    if(!db_value('SELECT COUNT(*) FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=:id AND '.order_visibility_sql(),['id'=>$id]))throw new ApiError('Order item not found or not assigned to you.',404);
}
function authorize_request(string $method, ?string $area, array $parts): void {
    require_roles(['Admin','Store','Sales']);
    if($area==='samples'){require_roles(['Admin','Store']);if($method==='GET'||($method==='POST'&&$parts===['issue']))return;if(($parts[1]??'')==='review'&&$method==='POST'){require_admin();return;}throw new ApiError('Action not allowed.',403);}
    if($area==='materials'&&($parts[1]??'')==='photo'&&$method==='PATCH'){require_roles(['Admin','Store']);return;}
    if($area==='order-items'&&($parts[1]??'')==='drawing'&&$method==='PUT'){require_roles(['Admin','Sales','Store']);return;}
    if($area==='enquiries'){require_roles(['Admin','Sales']);if(in_array($parts[0]??'',['settings','connection-script','request-sync'],true))require_admin();if($method==='GET'||($method==='POST'&&(($parts[1]??'')==='followups'||in_array($parts[0]??'',['connection-script','request-sync'],true)))||($method==='PUT'&&($parts[0]??'')==='settings'))return;throw new ApiError('Action not allowed.',403);}
    if($area==='whatsapp'){require_roles(['Admin','Sales']);if(($parts[0]??'')==='settings')require_admin();return;}
    if(app_role()==='Admin')return;
    $sales=app_role()==='Sales';$first=$parts[0]??'';$second=$parts[1]??'';
    if($method==='GET') {
        if($sales && ($area==='docs'||$area==='opening-stock'||($area==='inventory'&&$first!=='')))throw new ApiError('Sales may view stock availability, but not stock transaction records.',403);
        if(!$sales && in_array($area,['leads','crm-followups','follow-ups','followup-logs'],true))throw new ApiError('CRM is available to Sales and Admin.',403);
        if(in_array($area,['masters','lookup'],true)&&$first==='users')throw new ApiError('Only Admin can manage Users.',403);
        if($area==='masters'&&!in_array($first,['contacts','customers','material_categories','suppliers','transporters','states','client_categories','lead_sources'],true))throw new ApiError('Only Admin can manage this master.',403);
        return;
    }
    if($area==='uploads'&&$method==='POST')return;
    if($sales) {
        if($method==='POST'&&in_array($area,['contacts','crm-followups'],true)&&(!$parts||($area==='contacts'&&$parts===['bulk'])))return;
        if($method==='POST'&&$area==='leads'&&(!$parts||in_array($second,['followups','customer'],true)))return;
        if($method==='POST'&&$area==='orders'&&!$parts)return;
        if($method==='PUT'&&$area==='boq'&&count($parts)===1&&ctype_digit($first))return; // Final/Draft checked while locking the item.
    } else {
        if($method==='POST'&&$area==='materials'&&(!$parts||$parts===['bulk']))return;
        if($method==='POST'&&$area==='masters'&&count($parts)===1&&in_array($first,['suppliers','transporters','material_categories'],true))return;
        if($method==='POST'&&$area==='docs'&&count($parts)===1&&in_array($first,['material-in','material-issue','damage'],true))return;
        if($method==='POST'&&$area==='opening-stock'&&!$parts)return;
        if($method==='PATCH'&&$area==='production'&&$parts===['bulk'])return;
        if($method==='PATCH'&&$area==='order-items'&&$second==='production-status')return;
        if($method==='PUT'&&$area==='order-items'&&$second==='dispatch')return;
        if($method==='POST'&&$area==='boq'&&$second==='book')return;
    }
    throw new ApiError('Only Admin can correct, edit, delete or cancel saved records.',403);
}
