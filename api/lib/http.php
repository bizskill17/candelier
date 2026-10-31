<?php
// Small helpers for JSON responses and request bodies.

class ApiError extends Exception
{
    public int $status;
    public array $fields;

    public function __construct(string $message, int $status = 400, array $fields = [])
    {
        parent::__construct($message);
        $this->status = $status;
        $this->fields = $fields;
    }
}

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function request_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new ApiError('Request body must be valid JSON.', 400);
    }
    return $data;
}

function now(): string
{
    return date('Y-m-d H:i:s');
}

// Public addresses. The live site uses the defaults; the WordPress plugin sets them in config.php.
function app_files_url(): string { return rtrim((string)($GLOBALS['CONFIG']['files_url'] ?? 'https://candelier.bizskilledu.com/'), '/') . '/'; }
function app_api_url(): string { return (string)($GLOBALS['CONFIG']['api_url'] ?? 'https://candelier.bizskilledu.com/api/index.php'); }
