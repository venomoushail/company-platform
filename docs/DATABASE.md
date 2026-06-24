# Employee Training System Database

## Purpose

This database powers the employee training system. It tracks employees, locations, positions, training modules, lesson progress, quiz questions, quiz attempts, and manager permissions.

## Core Tables

### profiles

Stores employee/user account information.

Used for:
- Login identity
- Employee number
- First and last name
- Role/status
- Admin or manager access

### locations

Stores restaurant/store locations.

Important fields:
- store_number
- name
- is_active

### positions

Stores job positions such as Host, Server, Manager, General Manager.

### employee_positions

Connects employees to one or more positions.

This allows an employee to have multiple roles.

### training_modules

Stores each training course/module.

Important fields:
- title
- description
- category
- training_audience
- passing_score
- estimated_minutes
- status
- allow_retake
- max_attempts
- renewal_period_days

### training_slides

Stores individual slides/pages for a training module.

Important fields:
- id
- training_module_id
- slide_order
- title
- body
- created_at
- updated_at

### quiz_questions

Stores quiz questions for each training module.

### lesson_progress

Tracks employee progress through training content.

Used for:
- Started training
- Completed training
- Completion percentage
- Last activity

### quiz_attempts

Stores quiz results.

Used for:
- Score
- Passed/failed
- Attempt number
- Duration
- Completed date

### manager_location_permissions

Controls which locations a manager can access.

This is used so managers only see employees and reports for their assigned stores.

## Training Audience Rules

Training modules can be assigned to:

- all employees
- position-specific employees

Current allowed values:

```sql
'all'
'position_specific'