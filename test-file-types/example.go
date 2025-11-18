package main

import "fmt"

// User represents a user in the system
type User struct {
    ID    int
    Name  string
    Email string
}

// NewUser creates a new user
func NewUser(name, email string) *User {
    return &User{
        ID:    1,
        Name:  name,
        Email: email,
    }
}

func main() {
    user := NewUser("John", "john@example.com")
    fmt.Printf("User: %+v\n", user)
}
