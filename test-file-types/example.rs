// Rust example
struct User {
    id: u32,
    name: String,
    email: String,
}

impl User {
    fn new(name: String, email: String) -> Self {
        User {
            id: 1,
            name,
            email,
        }
    }

    fn display(&self) {
        println!("User: {} ({})", self.name, self.email);
    }
}

fn main() {
    let user = User::new("Alice".to_string(), "alice@example.com".to_string());
    user.display();
}
